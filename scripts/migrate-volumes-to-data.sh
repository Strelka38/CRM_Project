#!/usr/bin/env bash
# Copy Postgres and uploads from legacy Docker named volumes into ./data.
# Run this ONCE on an existing VPS after pulling compose with bind mounts,
# BEFORE (or instead of) starting the stack on empty ./data directories.
#
# Usage (from repo root):
#   ./scripts/migrate-volumes-to-data.sh
#   ./scripts/migrate-volumes-to-data.sh --force
#   PG_VOLUME=old_pgdata UPLOADS_VOLUME=old_uploads ./scripts/migrate-volumes-to-data.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"
cd "$ROOT"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

load_env
PROJECT="$(compose_project_name)"
PG_VOLUME="${PG_VOLUME:-${PROJECT}_pgdata}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-${PROJECT}_uploads}"

volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

copy_volume() {
  local volume="$1"
  local dest="$2"
  mkdir -p "$dest"
  docker run --rm \
    -v "${volume}:/from:ro" \
    -v "${dest}:/to" \
    alpine:3.20 \
    sh -c 'cp -a /from/. /to/'
}

echo "==> Проект Compose: $PROJECT"
echo "    том Postgres: $PG_VOLUME"
echo "    том uploads:  $UPLOADS_VOLUME"
echo

if ! volume_exists "$PG_VOLUME" && ! volume_exists "$UPLOADS_VOLUME"; then
  echo "Именованные тома не найдены. Кандидаты:" >&2
  docker volume ls --format '  {{.Name}}' | grep -E 'pgdata|uploads' || true
  echo >&2
  echo "Задайте PG_VOLUME и UPLOADS_VOLUME явно, если тома названы иначе." >&2
  exit 1
fi

if [[ -f "$ROOT/data/postgres/PG_VERSION" && "$FORCE" -ne 1 ]]; then
  echo "В data/postgres уже есть база (PG_VERSION)." >&2
  echo "Если это пустой init после compose up — остановите стек и повторите с --force." >&2
  echo "  docker compose stop" >&2
  echo "  ./scripts/migrate-volumes-to-data.sh --force" >&2
  exit 1
fi

if [[ -d "$ROOT/data/uploads" && -n "$(ls -A "$ROOT/data/uploads" 2>/dev/null || true)" && "$FORCE" -ne 1 ]]; then
  echo "data/uploads не пуст. Повторите с --force, чтобы перезаписать из тома." >&2
  exit 1
fi

echo "==> Останавливаю app и db, чтобы копия была согласованной..."
compose stop app db 2>/dev/null || true

if volume_exists "$PG_VOLUME"; then
  echo "==> Копирую $PG_VOLUME → data/postgres"
  mkdir -p "$ROOT/data/postgres"
  copy_volume "$PG_VOLUME" "$ROOT/data/postgres"
else
  echo "WARN: том $PG_VOLUME не найден — Postgres не скопирован." >&2
fi

if volume_exists "$UPLOADS_VOLUME"; then
  echo "==> Копирую $UPLOADS_VOLUME → data/uploads"
  mkdir -p "$ROOT/data/uploads"
  copy_volume "$UPLOADS_VOLUME" "$ROOT/data/uploads"
else
  echo "WARN: том $UPLOADS_VOLUME не найден — uploads не скопированы." >&2
fi

mkdir -p "$ROOT/backups"

echo
echo "Готово. Старые Docker-тома не удалялись (можно убрать позже: docker volume rm ...)."
echo "Запуск с bind-mounts:"
echo "  docker compose up -d"
