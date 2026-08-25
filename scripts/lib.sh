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
