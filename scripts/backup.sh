#!/usr/bin/env bash
# Full CRM snapshot: Postgres (custom format) + uploads → backups/crm-full-YYYYMMDD-HHMM.tar.gz
#
#   ./scripts/backup.sh
#   BACKUP_KEEP=7 ./scripts/backup.sh
#
# Rotate keeps the newest BACKUP_KEEP files (default 14).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"
cd "$ROOT"

load_env
DB_USER="$(db_user)"
DB_NAME="$(db_name)"
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M)"
NAME="crm-full-${STAMP}"
DEST_DIR="${BACKUP_DIR:-$ROOT/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/data/uploads}"

mkdir -p "$DEST_DIR" "$UPLOADS_DIR"

if ! compose ps -q db >/dev/null 2>&1 || [[ -z "$(compose ps -q db 2>/dev/null)" ]]; then
  echo "Контейнер db не запущен. Сначала: docker compose up -d db" >&2
  exit 1
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/crm-backup.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "==> pg_dump -Fc ($DB_NAME)"
compose exec -T db pg_dump -U "$DB_USER" -Fc "$DB_NAME" >"$WORKDIR/postgres.dump"

echo "==> uploads"
mkdir -p "$WORKDIR/uploads"
if [[ -d "$UPLOADS_DIR" ]]; then
  cp -a "$UPLOADS_DIR"/. "$WORKDIR/uploads/" 2>/dev/null || true
fi

PG_VER="$(compose exec -T db postgres --version 2>/dev/null | tr -d '\r"\\' || echo "PostgreSQL 16")"
CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat >"$WORKDIR/manifest.json" <<EOF
{
  "kind": "baikal-crm-full",
  "version": 1,
  "createdAt": "${CREATED_AT}",
  "database": "${DB_NAME}",
  "postgres": "${PG_VER}"
}
EOF

ARCHIVE="${DEST_DIR}/${NAME}.tar.gz"
echo "==> архив $ARCHIVE"
tar -C "$WORKDIR" -czf "$ARCHIVE" manifest.json postgres.dump uploads

if [[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -gt 0 ]]; then
  # Newest first; delete after the keep-limit.
  n=0
  while IFS= read -r file; do
    n=$((n + 1))
    if [[ "$n" -gt "$KEEP" ]]; then
      echo "    ротация: удаляю $(basename "$file")"
      rm -f "$file"
    fi
  done < <(ls -1t "$DEST_DIR"/crm-full-*.tar.gz 2>/dev/null || true)
fi

SIZE="$(wc -c <"$ARCHIVE" | tr -d ' ')"
echo "Готово: $ARCHIVE (${SIZE} байт)"
