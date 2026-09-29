# Shared helpers for CRM host scripts. Source from the other scripts in this folder.
# shellcheck shell=bash

if [[ -z "${ROOT:-}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose не найден. Установите Docker и повторите." >&2
    exit 1
  fi
}

load_env() {
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
  fi
}

db_user() {
  printf '%s' "${POSTGRES_USER:-crm}"
}

db_name() {
  printf '%s' "${POSTGRES_DB:-crm_event}"
}

db_host() {
  printf '%s' "${POSTGRES_HOST:-db}"
}

db_port() {
  printf '%s' "${POSTGRES_PORT:-5432}"
}

PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"

using_local_db() {
  case "$(db_host)" in
    db | localhost | 127.0.0.1 | ::1) return 0 ;;
    *) return 1 ;;
  esac
}

database_url_value() {
  printf 'postgresql://%s:%s@%s:%s/%s?schema=public' \
    "$(db_user)" "${POSTGRES_PASSWORD:-}" "$(db_host)" "$(db_port)" "$(db_name)"
}

db_container_running() {
  [[ -n "$(compose ps -q db 2>/dev/null || true)" ]]
}

ensure_pg_image() {
  if docker image inspect "$PG_IMAGE" >/dev/null 2>&1; then
    return 0
  fi
  echo "==> Скачиваю $PG_IMAGE"
  docker pull "$PG_IMAGE"
}

# Run a Postgres client binary against the current DATABASE host.
# Local: docker compose exec db. Remote: ephemeral postgres:16-alpine.
# Usage: pg_tool pg_dump -U crm -Fc crm_event
pg_tool() {
  local tool="${1:-}"
  shift || true
  if [[ -z "$tool" ]]; then
    echo "pg_tool: не указана команда" >&2
    return 1
  fi
  if using_local_db; then
    if ! db_container_running; then
      echo "Контейнер db не запущен. Сначала: cd $ROOT && docker compose up -d db" >&2
      return 1
    fi
    compose exec -T db "$tool" "$@"
    return
  fi
  ensure_pg_image
  docker run --rm -i \
    -e PGPASSWORD="${POSTGRES_PASSWORD:-}" \
    --entrypoint "$tool" \
    "$PG_IMAGE" \
    -h "$(db_host)" \
    -p "$(db_port)" \
    "$@"
}

compose_project_name() {
  if [[ -n "${COMPOSE_PROJECT_NAME:-}" ]]; then
    printf '%s' "$COMPOSE_PROJECT_NAME"
    return
  fi
  local name
  name="$(cd "$ROOT" && compose config 2>/dev/null | awk '$1 == "name:" { print $2; exit }')"
  if [[ -n "$name" ]]; then
    printf '%s' "$name"
    return
  fi
  basename "$ROOT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/_/g'
}

# Escape a value for .env double-quoted assignment. $$ → $ for Docker Compose.
env_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\$/$$/g'
}

# SQL string literal with quotes escaped.
sql_lit() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

# Set KEY="value" in a .env file, replacing the existing line if present.
set_env_key() {
  local key="$1"
  local value="$2"
  local file="${3:-$ROOT/.env}"
  local tmp found=0 line
  if [[ ! -f "$file" ]]; then
    printf '%s="%s"\n' "$key" "$(env_escape "$value")" >"$file"
    return
  fi
  tmp="$(mktemp "${TMPDIR:-/tmp}/crm-env.XXXXXX")"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$key="* ]]; then
      printf '%s="%s"\n' "$key" "$(env_escape "$value")" >>"$tmp"
      found=1
    else
      printf '%s\n' "$line" >>"$tmp"
    fi
  done <"$file"
  if [[ "$found" -eq 0 ]]; then
    printf '%s="%s"\n' "$key" "$(env_escape "$value")" >>"$tmp"
  fi
  mv "$tmp" "$file"
}

backup_dir() {
  printf '%s' "${BACKUP_DIR:-$ROOT/backups}"
}

db_running() {
  if using_local_db; then
    db_container_running
  else
    pg_tool pg_isready -U "$(db_user)" -d postgres >/dev/null 2>&1
  fi
}

wait_for_db() {
  local i=0
  until pg_tool pg_isready -U "$(db_user)" -d postgres >/dev/null 2>&1; do
    i=$((i + 1))
    if [[ "$i" -ge 40 ]]; then
      echo "Postgres не готов ($(db_host):$(db_port))." >&2
      return 1
    fi
    sleep 2
  done
}

psql_c() {
  pg_tool psql -U "$(db_user)" -d "$(db_name)" -v ON_ERROR_STOP=1 "$@"
}
