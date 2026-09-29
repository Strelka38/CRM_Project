#!/usr/bin/env bash
# Move this CRM instance to another VPS over SSH.
#
#   ./scripts/migrate-server.sh
#   ./scripts/migrate-server.sh --host 1.2.3.4 --user root
#
# Creates a snapshot, copies compose/.env/scripts/image, installs Docker
# on the remote if needed, restores the snapshot and starts the stack.
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
SKIP_SNAPSHOT=0
COPY_BACKUPS=0
BUILD_REMOTE=0
REMOTE_HOST=""
REMOTE_USER="root"
REMOTE_PORT="22"
REMOTE_DIR="/var/www/bsg-crm"
NEW_DOMAIN="${DOMAIN:-}"
IDENTITY=""
SSH_CTRL_DIR=""
SSH_CTRL=""
SSH_OPTS=()
REMOTE_ENV=""

usage() {
  cat <<EOF
Переезд CRM на другой VPS по SSH.

  ./scripts/migrate-server.sh
  ./scripts/migrate-server.sh --host 1.2.3.4 --user root

Флаги:
  --host IP          адрес нового сервера
  --user USER        SSH-пользователь (по умолчанию root)
  --port PORT        SSH-порт (22)
  --dir PATH         каталог установки (/var/www/bsg-crm)
  --domain NAME      домен на новом сервере (по умолчанию текущий)
  --identity FILE    SSH-ключ
  --yes              не спрашивать подтверждение
  --skip-snapshot    взять уже существующий последний снимок
  --copy-backups     скопировать все файлы из backups/
  --build-remote     если нет образа — собрать на новом сервере (долго)
  -h, --help         справка
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) REMOTE_HOST="${2:-}"; shift 2 ;;
    --user) REMOTE_USER="${2:-}"; shift 2 ;;
    --port) REMOTE_PORT="${2:-}"; shift 2 ;;
    --dir) REMOTE_DIR="${2:-}"; shift 2 ;;
    --domain) NEW_DOMAIN="${2:-}"; shift 2 ;;
    --identity | -i) IDENTITY="${2:-}"; shift 2 ;;
    --yes | -y) YES=1; shift ;;
    --skip-snapshot) SKIP_SNAPSHOT=1; shift ;;
    --copy-backups) COPY_BACKUPS=1; shift ;;
    --build-remote) BUILD_REMOTE=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "Неизвестный флаг: $1" ;;
  esac
done

command -v ssh >/dev/null 2>&1 || die "Нужен ssh."
command -v docker >/dev/null 2>&1 || die "Нужен docker на этой машине."
if ! command -v rsync >/dev/null 2>&1 && ! command -v scp >/dev/null 2>&1; then
  die "Нужен rsync или scp."
fi

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

if [[ -z "$REMOTE_HOST" ]]; then
  prompt REMOTE_HOST "IP или hostname нового сервера"
fi
[[ -n "$REMOTE_HOST" ]] || die "Нужен адрес сервера."
if [[ "$REMOTE_HOST" == "127.0.0.1" || "$REMOTE_HOST" == "localhost" || "$REMOTE_HOST" == "::1" ]]; then
  die "Укажите адрес другого сервера, не localhost."
fi

prompt REMOTE_USER "SSH-пользователь" "$REMOTE_USER"
prompt REMOTE_PORT "SSH-порт" "$REMOTE_PORT"
prompt REMOTE_DIR "Каталог на новом сервере" "$REMOTE_DIR"
prompt NEW_DOMAIN "Домен на новом сервере" "${NEW_DOMAIN:-${DOMAIN:-}}"

[[ "$REMOTE_PORT" =~ ^[0-9]+$ ]] || die "Некорректный SSH-порт."
[[ "$REMOTE_DIR" =~ ^/[A-Za-z0-9/_-]+$ ]] || die "Каталог должен быть абсолютным путём без пробелов: /var/www/bsg-crm"
[[ -n "$NEW_DOMAIN" ]] || die "Домен обязателен (для Caddy / AUTH_URL)."
NEW_DOMAIN="$(echo "$NEW_DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)"

if [[ -z "$IDENTITY" && -t 0 && "$YES" -ne 1 ]]; then
  read -r -p "Путь к SSH-ключу (пусто — пароль или ssh-agent): " IDENTITY
  IDENTITY="$(echo "${IDENTITY:-}" | xargs)"
fi
if [[ -n "$IDENTITY" && ! -f "$IDENTITY" ]]; then
  die "Ключ не найден: $IDENTITY"
fi

[[ -f "$ROOT/docker-compose.yml" && -f "$ROOT/.env" ]] || die "В $ROOT нет docker-compose.yml или .env — это не рабочая установка."

ARCHIVE=""
if [[ "$SKIP_SNAPSHOT" -eq 1 ]]; then
  ARCHIVE="$(ls -1t "$(backup_dir)"/crm-full-*.tar.gz 2>/dev/null | head -1 || true)"
  [[ -n "$ARCHIVE" ]] || die "Нет снимков. Снимите --skip-snapshot."
else
  echo "==> Снимок перед переездом"
  "$ROOT/scripts/backup.sh"
  ARCHIVE="$(ls -1t "$(backup_dir)"/crm-full-*.tar.gz 2>/dev/null | head -1 || true)"
  [[ -n "$ARCHIVE" ]] || die "Снимок не создался."
fi

HAS_IMAGE=0
docker image inspect crm-app:latest >/dev/null 2>&1 && HAS_IMAGE=1
HAS_TAR=0
[[ -f "$ROOT/crm-app.tar.gz" ]] && HAS_TAR=1
if [[ "$HAS_IMAGE" -eq 0 && "$HAS_TAR" -eq 0 && "$BUILD_REMOTE" -eq 0 ]]; then
  die "Нет образа crm-app:latest и файла crm-app.tar.gz. Соберите образ или передайте --build-remote."
fi

echo
echo "Перенос CRM"
echo "  Откуда:   $ROOT  (${DOMAIN:-без домена})"
echo "  Куда:     ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PORT}"
echo "  Каталог:  $REMOTE_DIR"
echo "  Домен:    $NEW_DOMAIN"
echo "  Снимок:   $(basename "$ARCHIVE")"
if ! using_local_db; then
  echo "  БД сейчас: $(db_host) — на новом сервере снова будет локальный Postgres из снимка."
fi
echo
echo "На новом сервере поставятся Docker (если нет), файлы CRM,"
echo "образ приложения, Postgres из снимка и Caddy."
echo "Этот сервер не выключается."
echo

if [[ "$YES" -ne 1 ]]; then
  read -r -p "Продолжить? [y/N] " ans
  if [[ "$ans" != "y" && "$ans" != "Y" && "$ans" != "д" && "$ans" != "Д" ]]; then
    echo "Отменено."
    exit 1
  fi
fi

SSH_CTRL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/crm-ssh.XXXXXX")"
SSH_CTRL="$SSH_CTRL_DIR/cm.sock"
REMOTE_ENV="$(mktemp "${TMPDIR:-/tmp}/crm-env.XXXXXX")"

cleanup() {
  if [[ -n "${SSH_CTRL:-}" ]]; then
    ssh -o ControlPath="$SSH_CTRL" -O exit "${REMOTE_USER}@${REMOTE_HOST}" 2>/dev/null || true
  fi
  rm -rf "$SSH_CTRL_DIR"
  rm -f "$REMOTE_ENV"
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

echo "==> Docker на новом сервере"
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
ssh_remote mkdir -p \
  "$REMOTE_DIR/data/postgres" \
  "$REMOTE_DIR/data/uploads" \
  "$REMOTE_DIR/backups" \
  "$REMOTE_DIR/docker" \
  "$REMOTE_DIR/scripts"

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

cp "$ROOT/.env" "$REMOTE_ENV"
set_env_key DOMAIN "$NEW_DOMAIN" "$REMOTE_ENV"
set_env_key AUTH_URL "https://${NEW_DOMAIN}" "$REMOTE_ENV"
set_env_key POSTGRES_HOST "db" "$REMOTE_ENV"
set_env_key POSTGRES_PORT "5432" "$REMOTE_ENV"
set_env_key POSTGRES_HOST_IP "" "$REMOTE_ENV"
set_env_key COMPOSE_FILE "docker-compose.yml" "$REMOTE_ENV"
set_env_key DATABASE_URL "postgresql://$(db_user):${POSTGRES_PASSWORD}@db:5432/$(db_name)?schema=public" "$REMOTE_ENV"

echo "==> Копирую compose, Caddy, скрипты, .env"
copy_to_remote "$ROOT/docker-compose.yml" "$REMOTE_DIR/docker-compose.yml"
if [[ -f "$ROOT/docker-compose.remote-db.yml" ]]; then
  copy_to_remote "$ROOT/docker-compose.remote-db.yml" "$REMOTE_DIR/docker-compose.remote-db.yml"
fi
copy_to_remote "$REMOTE_ENV" "$REMOTE_DIR/.env"
copy_to_remote "$ROOT/docker/" "$REMOTE_DIR/docker/"
copy_to_remote "$ROOT/scripts/" "$REMOTE_DIR/scripts/"
if [[ -f "$ROOT/Dockerfile" ]]; then
  copy_to_remote "$ROOT/Dockerfile" "$REMOTE_DIR/Dockerfile"
fi
if [[ -f "$ROOT/install.sh" ]]; then
  copy_to_remote "$ROOT/install.sh" "$REMOTE_DIR/install.sh"
fi

echo "==> Копирую снимок $(basename "$ARCHIVE")"
copy_to_remote "$ARCHIVE" "$REMOTE_DIR/backups/$(basename "$ARCHIVE")"

if [[ "$COPY_BACKUPS" -eq 1 ]]; then
  echo "==> Копирую все снимки из backups/"
  copy_to_remote "$(backup_dir)/" "$REMOTE_DIR/backups/"
fi

if [[ "$HAS_IMAGE" -eq 1 ]]; then
  echo "==> Передаю Docker-образ crm-app:latest (это может занять несколько минут)"
  docker save crm-app:latest | gzip -1 | ssh_remote "gunzip | docker load"
elif [[ "$HAS_TAR" -eq 1 ]]; then
  echo "==> Копирую crm-app.tar.gz"
  copy_to_remote "$ROOT/crm-app.tar.gz" "$REMOTE_DIR/crm-app.tar.gz"
  ssh_remote "gunzip -c $(printf '%q' "$REMOTE_DIR/crm-app.tar.gz") | docker load"
fi

echo "==> Поднимаю стек и восстанавливаю снимок"
ssh_remote bash -s -- "$REMOTE_DIR" "$(basename "$ARCHIVE")" "$BUILD_REMOTE" <<'REMOTE'
set -euo pipefail
DIR="$1"
SNAP="$2"
BUILD_REMOTE="$3"
cd "$DIR"
chmod +x scripts/*.sh scripts/crm 2>/dev/null || true

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "Docker Compose не найден на новом сервере." >&2
  exit 1
fi

mkdir -p data/postgres data/uploads backups

if [[ "$BUILD_REMOTE" -eq 1 ]] && ! docker image inspect crm-app:latest >/dev/null 2>&1; then
  echo "    собираю образ на новом сервере..."
  compose build app
fi

compose up -d db
echo "    жду Postgres..."
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
    echo "Postgres на новом сервере не готов." >&2
    exit 1
  fi
  sleep 2
done

./scripts/restore.sh --yes "backups/${SNAP}"
compose up -d
if [[ -x ./scripts/install-cli.sh ]]; then
  ./scripts/install-cli.sh || true
fi
echo
compose ps
REMOTE

echo
echo "=========================================="
echo "  Переезд завершён"
echo "=========================================="
echo "Новый сервер: ${REMOTE_USER}@${REMOTE_HOST}"
echo "Каталог:      ${REMOTE_DIR}"
echo "Сайт:         https://${NEW_DOMAIN}"
echo
echo "Переключите A/AAAA домена на ${REMOTE_HOST}, если ещё не."
echo "Проверка:  ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && crm status'"
echo "Этот сервер не остановлен — после проверки можно: docker compose stop"
echo
