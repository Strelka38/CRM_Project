#!/usr/bin/env bash
# Restore a full CRM snapshot created by scripts/backup.sh or the /backup UI.
#
#   ./scripts/restore.sh backups/crm-full-YYYYMMDD-HHMM.tar.gz
#   ./scripts/restore.sh --dry-run backups/crm-full-YYYYMMDD-HHMM.tar.gz
#   ./scripts/restore.sh --yes backups/crm-full-YYYYMMDD-HHMM.tar.gz
#
# Replaces Postgres contents and ./data/uploads. JSON /backup is not involved.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"
cd "$ROOT"

YES=0
DRY=0
ARCHIVE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes | -y)
      YES=1
      shift
      ;;
    --dry-run)
      DRY=1
      shift
      ;;
    -h | --help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Неизвестный флаг: $1" >&2
      exit 1
      ;;
    *)
      ARCHIVE="$1"
      shift
      ;;
  esac
done

if [[ -z "$ARCHIVE" ]]; then
  echo "Укажите архив: ./scripts/restore.sh backups/crm-full-YYYYMMDD-HHMM.tar.gz" >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Файл не найден: $ARCHIVE" >&2
  exit 1
fi

load_env
DB_USER="$(db_user)"
DB_NAME="$(db_name)"
if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ || ! "$DB_USER" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Некорректные POSTGRES_USER / POSTGRES_DB" >&2
  exit 1
fi
UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/data/uploads}"

echo "Архив:    $ARCHIVE"
echo "База:     $DB_USER @ $DB_NAME"
echo "Файлы:    $UPLOADS_DIR"
echo "Это заменит текущую Postgres и каталог uploads."
echo

if [[ "$DRY" -eq 1 ]]; then
  echo "dry-run: ничего не меняю."
  tar -tzf "$ARCHIVE" | sed -n '1,40p'
  exit 0
fi

if [[ "$YES" -ne 1 ]]; then
  read -r -p "Введите YES чтобы продолжить: " confirm
  if [[ "$confirm" != "YES" ]]; then
    echo "Отменено."
    exit 1
  fi
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/crm-restore.XXXXXX")"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "==> Распаковка"
tar -xzf "$ARCHIVE" -C "$WORKDIR"

if [[ ! -f "$WORKDIR/manifest.json" || ! -f "$WORKDIR/postgres.dump" ]]; then
  echo "В архиве нет manifest.json или postgres.dump — это не полный снимок CRM." >&2
  exit 1
fi

KIND="$(tr -d '\n' <"$WORKDIR/manifest.json" | sed -n 's/.*"kind"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
if [[ "$KIND" != "baikal-crm-full" ]]; then
  echo "Некорректный kind в manifest.json: ${KIND:-пусто}" >&2
  exit 1
fi

if ! compose ps -q db >/dev/null 2>&1 || [[ -z "$(compose ps -q db 2>/dev/null)" ]]; then
  echo "==> Поднимаю db"
  compose up -d db
  echo "    жду healthcheck..."
  i=0
  until compose exec -T db pg_isready -U "$DB_USER" -d postgres >/dev/null 2>&1; do
    i=$((i + 1))
    if [[ "$i" -ge 40 ]]; then
      echo "Postgres не готов." >&2
      exit 1
    fi
    sleep 2
  done
fi

echo "==> Останавливаю приложение"
compose stop app 2>/dev/null || true

echo "==> Восстанавливаю Postgres"
compose exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  >/dev/null
compose exec -T db dropdb -U "$DB_USER" --if-exists "$DB_NAME"
compose exec -T db createdb -U "$DB_USER" "$DB_NAME"
compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl --exit-on-error \
  <"$WORKDIR/postgres.dump"

echo "==> Восстанавливаю uploads"
mkdir -p "$UPLOADS_DIR"
# Replace contents, keep the bind-mount directory itself.
find "$UPLOADS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
if [[ -d "$WORKDIR/uploads" ]]; then
  cp -a "$WORKDIR/uploads"/. "$UPLOADS_DIR/"
fi

echo "==> Запускаю приложение"
compose up -d app

echo "Готово. Проверьте сайт и логи: docker compose logs -f app"
