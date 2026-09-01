#!/usr/bin/env bash
# Если апдейт подменил compose (pgdata → пустой ./data/postgres) —
# живая база всё ещё в Docker-томе. Скрипт копирует её обратно.
#
#   cd /var/www/bsg-crm   # каталог установки
#   ./scripts/rescue-named-volumes.sh
#   ./scripts/rescue-named-volumes.sh --yes
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"
cd "$ROOT"

YES=0
if [[ "${1:-}" == "--yes" ]]; then
  YES=1
fi

load_env
PROJECT="$(compose_project_name)"
PG_VOLUME="${PG_VOLUME:-${PROJECT}_pgdata}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-${PROJECT}_uploads}"

echo "=========================================="
echo "  Диагностика томов CRM"
echo "=========================================="
echo "Каталог: $ROOT"
echo "Проект:  $PROJECT"
echo

echo "==> docker compose ps"
compose ps || true
echo

echo "==> Тома pgdata / uploads"
docker volume ls --format '{{.Name}}' | grep -E 'pgdata|uploads' || echo "(нет)"
echo

if [[ -f "$ROOT/data/postgres/PG_VERSION" ]]; then
  echo "data/postgres: есть PG_VERSION (bind-mount)"
else
  echo "data/postgres: нет PG_VERSION"
fi
if [[ -d "$ROOT/data/uploads" ]]; then
  echo "data/uploads: $(find "$ROOT/data/uploads" -type f 2>/dev/null | wc -l | tr -d ' ') файлов"
fi
echo

echo "==> Снимки"
ls -lt "$ROOT/backups"/crm-full-*.tar.gz 2>/dev/null | head -5 || echo "(нет файлов backups/crm-full-*.tar.gz)"
echo

volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

if ! volume_exists "$PG_VOLUME"; then
  echo "Том $PG_VOLUME не найден."
  echo "Если CRM в другом каталоге — запустите скрипт оттуда."
  echo "Если том называется иначе:"
  echo "  PG_VOLUME=имя_тома ./scripts/rescue-named-volumes.sh --yes"
  echo
  echo "Откат из снимка (если update.sh успел сделать backup):"
  echo "  ./scripts/restore.sh backups/crm-full-YYYYMMDD-HHMM.tar.gz"
  exit 1
fi

echo "Найден том с живой базой: $PG_VOLUME"
if volume_exists "$UPLOADS_VOLUME"; then
  echo "Найден том uploads:       $UPLOADS_VOLUME"
fi
echo

if [[ "$YES" -ne 1 ]]; then
  echo "Это скопирует том → ./data/postgres (перезапишет пустой init после апдейта)"
  echo "и поднимет стек с bind-mounts."
  echo
  echo "Запуск: $0 --yes"
  exit 0
fi

echo "==> Копирую тома в ./data и запускаю стек"
"$ROOT/scripts/migrate-volumes-to-data.sh" --force
compose up -d --no-build

echo
echo "Готово. Проверьте:"
echo "  compose logs -f app"
echo "  сайт и вход под старым админом"
