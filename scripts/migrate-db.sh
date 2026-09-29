#!/usr/bin/env bash
# Move Postgres off this CRM host onto a dedicated VPS.
#
#   ./scripts/migrate-db.sh
#   ./scripts/migrate-db.sh --host 1.2.3.4 --user root
#   ./scripts/migrate-db.sh --revert
#
# App / Caddy stay here. The remote machine gets Docker + Postgres 16,
# the dump is restored, DATABASE_URL is switched, local db is removed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"
cd "$ROOT"
load_env

die() {
  echo "$*" >&2
  exit 1
}

YES=0
REVERT=0
KEEP_LOCAL=0
SKIP_DUMP=0
REMOTE_HOST=""
REMOTE_USER="root"
REMOTE_PORT="22"
REMOTE_DIR="/var/www/bsg-crm-db"
REMOTE_DB_PORT="5432"
IDENTITY=""
DUMP_FILE=""
SSH_CTRL_DIR=""
SSH_CTRL=""
SSH_OPTS=()
APP_WAS_RUNNING=0

usage() {
  cat <<EOF
Вынести Postgres на другой VPS. Приложение остаётся на этой машине.

  ./scripts/migrate-db.sh
  ./scripts/migrate-db.sh --host 1.2.3.4 --user root
  ./scripts/migrate-db.sh --revert

Флаги:
  --host IP          адрес сервера для Postgres
  --user USER        SSH-пользователь (по умолчанию root)
  --port PORT        SSH-порт (22)
  --dir PATH         каталог Postgres на том сервере (/var/www/bsg-crm-db)
  --db-port PORT     порт Postgres (5432)
  --identity FILE    SSH-ключ
  --dump FILE        готовый pg_dump -Fc вместо живого дампа
  --keep-local       не удалять локальный контейнер db
  --revert           вернуть базу на этот сервер (с текущего POSTGRES_HOST)
  --yes              не спрашивать подтверждение
  -h, --help         справка
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) REMOTE_HOST="${2:-}"; shift 2 ;;
    --user) REMOTE_USER="${2:-}"; shift 2 ;;
    --port) REMOTE_PORT="${2:-}"; shift 2 ;;
    --dir) REMOTE_DIR="${2:-}"; shift 2 ;;
    --db-port) REMOTE_DB_PORT="${2:-}"; shift 2 ;;
    --identity | -i) IDENTITY="${2:-}"; shift 2 ;;
    --dump) DUMP_FILE="${2:-}"; SKIP_DUMP=1; shift 2 ;;
    --keep-local) KEEP_LOCAL=1; shift ;;
    --revert) REVERT=1; shift ;;
    --yes | -y) YES=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "Неизвестный флаг: $1" ;;
  esac
done

command -v ssh >/dev/null 2>&1 || die "Нужен ssh."
command -v docker >/dev/null 2>&1 || die "Нужен docker на этой машине."
if ! command -v rsync >/dev/null 2>&1 && ! command -v scp >/dev/null 2>&1; then
  die "Нужен rsync или scp."
fi
[[ -f "$ROOT/docker-compose.yml" && -f "$ROOT/.env" ]] || die "В $ROOT нет docker-compose.yml или .env — это не рабочая установка."
[[ -f "$ROOT/docker/db-only-compose.yml" ]] || die "Нет $ROOT/docker/db-only-compose.yml"
[[ -f "$ROOT/docker-compose.remote-db.yml" ]] || die "Нет $ROOT/docker-compose.remote-db.yml"

prompt() {
  local var="$1" text="$2" def="${3:-}" val
  if [[ -n "${!var:-}" && "$YES" -eq 1 ]]; then
    return
  fi
  if [[ -n "$def" ]]; then
    read -r -p "$text [$def]: " val
    val="${val:-$def}"
  else
    read -r -p "$text: " val
  fi
  printf -v "$var" '%s' "$(echo "$val" | xargs)"
}

confirm_go() {
  if [[ "$YES" -eq 1 ]]; then
    return 0
  fi
  read -r -p "Продолжить? [y/N] " ans
  if [[ "$ans" != "y" && "$ans" != "Y" && "$ans" != "д" && "$ans" != "Д" ]]; then
    echo "Отменено."
    exit 1
  fi
}

start_app_if_needed() {
  if [[ "$APP_WAS_RUNNING" -eq 1 ]]; then
    compose up -d app >/dev/null 2>&1 || compose up -d app || true
  fi
}

compose_base() {
  compose -f "$ROOT/docker-compose.yml" "$@"
}

apply_local_env() {
  local host="$1"
  local port="${2:-$(db_port)}"
  local host_ip="${3:-}"
  export POSTGRES_HOST="$host"
  export POSTGRES_PORT="$port"
  set_env_key POSTGRES_HOST "$host"
  set_env_key POSTGRES_PORT "$port"
  if [[ "$host" == "db" ]]; then
    set_env_key COMPOSE_FILE "docker-compose.yml"
    export COMPOSE_FILE="docker-compose.yml"
    set_env_key POSTGRES_HOST_IP ""
  else
    set_env_key COMPOSE_FILE "docker-compose.yml:docker-compose.remote-db.yml"
    export COMPOSE_FILE="docker-compose.yml:docker-compose.remote-db.yml"
    if [[ -n "$host_ip" ]]; then
      set_env_key POSTGRES_HOST_IP "$host_ip"
      export POSTGRES_HOST_IP="$host_ip"
    fi
  fi
  set_env_key DATABASE_URL "$(database_url_value)"
  load_env
}

resolve_ipv4() {
  local host="$1" ip=""
  if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s' "$host"
    return 0
  fi
  if command -v getent >/dev/null 2>&1; then
    ip="$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1; exit}')"
  fi
  if [[ -z "$ip" ]] && command -v python3 >/dev/null 2>&1; then
    ip="$(python3 - "$host" <<'PY' 2>/dev/null || true
import socket, sys
print(socket.getaddrinfo(sys.argv[1], None, socket.AF_INET)[0][4][0])
PY
)"
  fi
  printf '%s' "$(echo "${ip:-}" | xargs)"
}

pg_client_at() {
  local host="$1" port="$2" tool="$3"
  shift 3
  ensure_pg_image
  docker run --rm -i \
    -e PGPASSWORD="${POSTGRES_PASSWORD:-}" \
    --entrypoint "$tool" \
    "$PG_IMAGE" \
    -h "$host" \
    -p "$port" \
    "$@"
}

revert_to_local() {
  using_local_db && die "Postgres и так на этой машине ($(db_host)). Нечего возвращать."
  [[ -n "${POSTGRES_PASSWORD:-}" ]] || die "В .env нет POSTGRES_PASSWORD."

  local source_host source_port dump
  source_host="$(db_host)"
  source_port="$(db_port)"
  dump="$(backup_dir)/crm-db-revert-$(date +%Y%m%d-%H%M).dump"
  mkdir -p "$(backup_dir)"

  echo
  echo "Вернуть Postgres на этот сервер"
  echo "  Сейчас:   ${source_host}:${source_port}"
  echo "  Куда:     локальный контейнер db"
  echo "  Дамп:     $(basename "$dump")"
  echo
  echo "Удалённый Postgres не выключается — его можно оставить как запас."
  echo
  confirm_go

  if [[ -n "$(compose ps -q app 2>/dev/null || true)" ]]; then
    APP_WAS_RUNNING=1
  fi

  echo "==> Останавливаю приложение (чтобы дамп был консистентным)"
  compose stop app 2>/dev/null || true
  trap 'start_app_if_needed' EXIT

  echo "==> Дамп с ${source_host}"
  pg_tool pg_dump -U "$(db_user)" -Fc "$(db_name)" >"$dump"
  [[ -s "$dump" ]] || die "Дамп пустой: $dump"

  echo "==> Поднимаю локальный Postgres"
  export COMPOSE_FILE="docker-compose.yml"
  compose up -d db
  export POSTGRES_HOST=db
  export POSTGRES_PORT=5432
  wait_for_db || die "Локальный Postgres не готов."

  echo "==> Восстанавливаю дамп локально"
  pg_tool psql -U "$(db_user)" -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$(db_name)' AND pid <> pg_backend_pid();" \
    >/dev/null
  pg_tool dropdb -U "$(db_user)" --if-exists "$(db_name)"
  pg_tool createdb -U "$(db_user)" "$(db_name)"
  pg_tool pg_restore -U "$(db_user)" -d "$(db_name)" --no-owner --no-acl --exit-on-error <"$dump"

  apply_local_env db 5432
  trap - EXIT

  echo "==> Перезапускаю приложение на локальную БД"
  compose up -d --force-recreate app
  compose up -d caddy 2>/dev/null || true

  echo
  echo "=========================================="
  echo "  Postgres снова на этом сервере"
  echo "=========================================="
  echo "Дамп:     $dump"
  echo "Удалённый ${source_host}:${source_port} не трогали."
  echo "Проверка: crm status"
  echo
}

if [[ "$REVERT" -eq 1 ]]; then
  revert_to_local
  exit 0
fi

if [[ -z "$REMOTE_HOST" ]]; then
  prompt REMOTE_HOST "IP или hostname сервера для Postgres"
fi
[[ -n "$REMOTE_HOST" ]] || die "Нужен адрес сервера."
if [[ "$REMOTE_HOST" == "127.0.0.1" || "$REMOTE_HOST" == "localhost" || "$REMOTE_HOST" == "::1" || "$REMOTE_HOST" == "db" ]]; then
  die "Укажите адрес другого сервера, не localhost."
fi
if [[ "$REMOTE_HOST" == "$(db_host)" ]]; then
  die "Postgres уже на ${REMOTE_HOST}."
fi

prompt REMOTE_USER "SSH-пользователь" "$REMOTE_USER"
prompt REMOTE_PORT "SSH-порт" "$REMOTE_PORT"
prompt REMOTE_DIR "Каталог Postgres на том сервере" "$REMOTE_DIR"
prompt REMOTE_DB_PORT "Порт Postgres" "$REMOTE_DB_PORT"

[[ "$REMOTE_PORT" =~ ^[0-9]+$ ]] || die "Некорректный SSH-порт."
[[ "$REMOTE_DB_PORT" =~ ^[0-9]+$ ]] || die "Некорректный порт Postgres."
[[ "$REMOTE_DIR" =~ ^/[A-Za-z0-9/_-]+$ ]] || die "Каталог должен быть абсолютным путём без пробелов: /var/www/bsg-crm-db"
[[ -n "${POSTGRES_PASSWORD:-}" ]] || die "В .env нет POSTGRES_PASSWORD."

if [[ -z "$IDENTITY" && -t 0 && "$YES" -ne 1 ]]; then
  read -r -p "Путь к SSH-ключу (пусто — пароль или ssh-agent): " IDENTITY
  IDENTITY="$(echo "${IDENTITY:-}" | xargs)"
fi
if [[ -n "$IDENTITY" && ! -f "$IDENTITY" ]]; then
  die "Ключ не найден: $IDENTITY"
fi

if [[ "$SKIP_DUMP" -eq 1 ]]; then
  [[ -n "$DUMP_FILE" && -f "$DUMP_FILE" ]] || die "Файл дампа не найден: ${DUMP_FILE:-}"
fi

SOURCE_LOCAL=0
using_local_db && SOURCE_LOCAL=1
SOURCE_DESC="$(db_host):$(db_port)"
if [[ "$SOURCE_LOCAL" -eq 1 ]]; then
  SOURCE_DESC="этот сервер (контейнер db)"
  db_container_running || die "Контейнер db не запущен. Сначала: docker compose up -d db"
fi

echo
echo "Вынос Postgres"
echo "  Откуда:     $SOURCE_DESC"
echo "  Куда:       ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}"
echo "  Каталог:    $REMOTE_DIR"
echo "  Порт БД:    $REMOTE_DB_PORT"
echo "  Приложение: ${DOMAIN:-этот сервер} — остаётся здесь"
echo
echo "На том сервере поставятся Docker (если нет) и Postgres 16."
echo "Порт ${REMOTE_DB_PORT} откроется только для IP этого сервера."
if [[ "$KEEP_LOCAL" -eq 0 && "$SOURCE_LOCAL" -eq 1 ]]; then
  echo "Локальный контейнер db после переключения будет удалён"
  echo "(файлы ./data/postgres не трогаем)."
fi
echo

confirm_go

SSH_CTRL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/crm-ssh.XXXXXX")"
SSH_CTRL="$SSH_CTRL_DIR/cm.sock"
REMOTE_ENV="$(mktemp "${TMPDIR:-/tmp}/crm-db-env.XXXXXX")"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/crm-db-mig.XXXXXX")"

cleanup() {
  if [[ -n "${SSH_CTRL:-}" ]]; then
    ssh -o ControlPath="$SSH_CTRL" -O exit "${REMOTE_USER}@${REMOTE_HOST}" 2>/dev/null || true
  fi
  rm -rf "${SSH_CTRL_DIR:-}" "${WORKDIR:-}"
  rm -f "${REMOTE_ENV:-}"
  start_app_if_needed
}
trap cleanup EXIT

SSH_OPTS=(
  -o ControlMaster=auto
  -o ControlPath="$SSH_CTRL"
  -o ControlPersist=30m
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=10
  -p "$REMOTE_PORT"
)
if [[ -n "$IDENTITY" ]]; then
  SSH_OPTS+=(-i "$IDENTITY")
fi

ssh_remote() {
  ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$@"
}

echo
echo "==> SSH ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}"
echo "    Если ключ не настроен — введите пароль root один раз."
ssh "${SSH_OPTS[@]}" -o ControlMaster=yes "${REMOTE_USER}@${REMOTE_HOST}" true

APP_IP="$(ssh_remote 'printf %s "${SSH_CLIENT%% *}"' | tr -d '\r')"
[[ -n "$APP_IP" ]] || die "Не удалось определить IP этого сервера (SSH_CLIENT)."

HOST_IP="$(resolve_ipv4 "$REMOTE_HOST")"
[[ -n "$HOST_IP" ]] || die "Не удалось резолвить $REMOTE_HOST в IPv4. Укажите IP в --host."

POSTGRES_BIND="0.0.0.0"
if [[ "$REMOTE_HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  POSTGRES_BIND="$REMOTE_HOST"
fi

echo "    этот сервер с точки зрения БД: $APP_IP"
echo "    Postgres будет слушать ${POSTGRES_BIND}:${REMOTE_DB_PORT}"

echo "==> Docker на сервере БД"
ssh_remote bash -s <<'REMOTE'
set -euo pipefail
if ! command -v curl >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl ca-certificates
  fi
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "    ставлю Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
if ! docker info >/dev/null 2>&1; then
  systemctl start docker || true
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker установлен, но демон не отвечает. Нужны права root." >&2
  exit 1
fi
if docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1; then
  exit 0
fi
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) arch="x86_64" ;;
  aarch64|arm64) arch="aarch64" ;;
  *) echo "Неподдерживаемая архитектура: $arch" >&2; exit 1 ;;
esac
plugin_dir="/usr/local/lib/docker/cli-plugins"
mkdir -p "$plugin_dir"
curl -fsSL "https://github.com/docker/compose/releases/download/v2.36.2/docker-compose-linux-${arch}" \
  -o "${plugin_dir}/docker-compose"
chmod +x "${plugin_dir}/docker-compose"
if ! docker compose version >/dev/null 2>&1; then
  ln -sf "${plugin_dir}/docker-compose" /usr/local/bin/docker-compose
fi
REMOTE

echo "==> Каталог $REMOTE_DIR"
ssh_remote mkdir -p "$REMOTE_DIR/data/postgres"

copy_to_remote() {
  local src="$1" dest="$2"
  if command -v rsync >/dev/null 2>&1; then
    local rsh="ssh"
    local o
    for o in "${SSH_OPTS[@]}"; do
      rsh+=" $(printf '%q' "$o")"
    done
    rsync -aH --numeric-ids --info=progress2 -e "$rsh" "$src" "${REMOTE_USER}@${REMOTE_HOST}:$dest"
  else
    local scp_opts=(-q -P "$REMOTE_PORT" -o ControlPath="$SSH_CTRL" -o ControlMaster=auto)
    if [[ -n "$IDENTITY" ]]; then
      scp_opts+=(-i "$IDENTITY")
    fi
    scp "${scp_opts[@]}" -r "$src" "${REMOTE_USER}@${REMOTE_HOST}:$dest"
  fi
}

{
  printf 'POSTGRES_USER="%s"\n' "$(env_escape "$(db_user)")"
  printf 'POSTGRES_PASSWORD="%s"\n' "$(env_escape "${POSTGRES_PASSWORD}")"
  printf 'POSTGRES_DB="%s"\n' "$(env_escape "$(db_name)")"
  printf 'POSTGRES_PORT="%s"\n' "$(env_escape "$REMOTE_DB_PORT")"
  printf 'POSTGRES_BIND="%s"\n' "$(env_escape "$POSTGRES_BIND")"
} >"$REMOTE_ENV"

echo "==> Копирую compose Postgres"
copy_to_remote "$ROOT/docker/db-only-compose.yml" "$REMOTE_DIR/docker-compose.yml"
copy_to_remote "$REMOTE_ENV" "$REMOTE_DIR/.env"

echo "==> Файрвол: ${REMOTE_DB_PORT} только с ${APP_IP}"
ssh_remote bash -s -- "$APP_IP" "$REMOTE_DB_PORT" <<'REMOTE'
set -euo pipefail
ip="$1"
port="$2"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi "Status: active"; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow from "$ip" to any port "$port" proto tcp comment "crm-postgres" || true
  exit 0
fi
if [[ "$ip" == *:* ]]; then
  if command -v ip6tables >/dev/null 2>&1; then
    ip6tables -C INPUT -p tcp --dport "$port" -s "$ip" -j ACCEPT 2>/dev/null || \
      ip6tables -I INPUT -p tcp --dport "$port" -s "$ip" -j ACCEPT
    ip6tables -C INPUT -p tcp --dport "$port" -j DROP 2>/dev/null || \
      ip6tables -A INPUT -p tcp --dport "$port" -j DROP
  fi
  exit 0
fi
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "$port" -s "$ip" -j ACCEPT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport "$port" -s "$ip" -j ACCEPT
  iptables -C INPUT -p tcp --dport "$port" -j DROP 2>/dev/null || \
    iptables -A INPUT -p tcp --dport "$port" -j DROP
fi
REMOTE

echo "==> Поднимаю Postgres на новом сервере"
ssh_remote bash -s -- "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
DIR="$1"
cd "$DIR"
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "Docker Compose не найден на сервере БД." >&2
  exit 1
fi
compose up -d
user="crm"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  user="${POSTGRES_USER:-crm}"
fi
i=0
until compose exec -T db pg_isready -U "$user" -d postgres >/dev/null 2>&1; do
  i=$((i + 1))
  if [[ "$i" -ge 40 ]]; then
    echo "Postgres на сервере БД не готов." >&2
    exit 1
  fi
  sleep 2
done
echo "    Postgres слушает порт"
REMOTE

if [[ -n "$(compose ps -q app 2>/dev/null || true)" ]]; then
  APP_WAS_RUNNING=1
fi

echo "==> Останавливаю приложение (короткое окно записи)"
compose stop app 2>/dev/null || true

if [[ "$SKIP_DUMP" -eq 1 ]]; then
  echo "==> Берём дамп $(basename "$DUMP_FILE")"
  cp -a "$DUMP_FILE" "$WORKDIR/postgres.dump"
else
  echo "==> Дамп Postgres ($(db_name))"
  pg_tool pg_dump -U "$(db_user)" -Fc "$(db_name)" >"$WORKDIR/postgres.dump"
fi
[[ -s "$WORKDIR/postgres.dump" ]] || {
  start_app_if_needed
  die "Дамп пустой."
}

KEEP_DUMP="$(backup_dir)/crm-db-$(date +%Y%m%d-%H%M).dump"
mkdir -p "$(backup_dir)"
cp -a "$WORKDIR/postgres.dump" "$KEEP_DUMP"
echo "    копия дампа: $KEEP_DUMP"

echo "==> Копирую дамп на сервер БД"
copy_to_remote "$WORKDIR/postgres.dump" "$REMOTE_DIR/postgres.dump"

echo "==> Восстанавливаю базу"
ssh_remote bash -s -- "$REMOTE_DIR" "$(db_user)" "$(db_name)" <<'REMOTE'
set -euo pipefail
DIR="$1"
DB_USER="$2"
DB_NAME="$3"
cd "$DIR"
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "Docker Compose не найден." >&2
  exit 1
fi
if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ || ! "$DB_USER" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Некорректные POSTGRES_USER / POSTGRES_DB" >&2
  exit 1
fi
compose exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  >/dev/null
compose exec -T db dropdb -U "$DB_USER" --if-exists "$DB_NAME"
compose exec -T db createdb -U "$DB_USER" "$DB_NAME"
compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl --exit-on-error \
  <postgres.dump
rm -f postgres.dump
compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c 'SELECT count(*) AS users FROM "User";' || true
REMOTE

echo "==> Проверяю доступ с этой машины → ${REMOTE_HOST}:${REMOTE_DB_PORT}"
if ! pg_client_at "$REMOTE_HOST" "$REMOTE_DB_PORT" pg_isready -U "$(db_user)" -d postgres >/dev/null 2>&1; then
  echo "Не достучаться до Postgres на ${REMOTE_HOST}:${REMOTE_DB_PORT} с этой машины." >&2
  echo "Частая причина — файрвол панели хостера. Откройте TCP ${REMOTE_DB_PORT} только с IP ${APP_IP}." >&2
  echo "Приложение возвращаю на старую базу. Удалённый Postgres уже содержит копию." >&2
  exit 1
fi
if ! pg_client_at "$REMOTE_HOST" "$REMOTE_DB_PORT" psql -U "$(db_user)" -d "$(db_name)" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null; then
  die "Postgres отвечает, но вход в базу не удался. Пароль/pg_hba. Приложение возвращаю на старую базу."
fi

echo "==> Переключаю приложение на ${REMOTE_HOST}"
apply_local_env "$REMOTE_HOST" "$REMOTE_DB_PORT" "$HOST_IP"

echo "==> Запускаю приложение"
compose up -d --force-recreate app
compose up -d caddy 2>/dev/null || true
APP_WAS_RUNNING=0

if [[ "$KEEP_LOCAL" -eq 0 && "$SOURCE_LOCAL" -eq 1 ]]; then
  echo "    убираю локальный контейнер db"
  compose_base stop db 2>/dev/null || true
  compose_base rm -sf db 2>/dev/null || true
fi

echo
echo "=========================================="
echo "  Postgres вынесен"
echo "=========================================="
echo "Приложение:  этот сервер (${DOMAIN:-$ROOT})"
echo "База:        ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DB_PORT}"
echo "Каталог БД:  $REMOTE_DIR"
echo "Дамп:        $KEEP_DUMP"
echo
echo "В панели хостера откройте TCP ${REMOTE_DB_PORT} только с IP ${APP_IP},"
echo "если облачный файрвол ещё закрыт."
echo
echo "Проверка:  crm status"
echo "Откат:     crm migrate-db --revert"
echo
if [[ "$SOURCE_LOCAL" -eq 1 ]]; then
  echo "Локальные файлы ./data/postgres не удалялись."
fi
echo
