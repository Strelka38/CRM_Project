#!/usr/bin/env bash
# Print a crontab line for nightly full snapshots. Does not edit crontab itself.
#
#   ./scripts/backup-cron.sh
#
# Example crontab (03:00 every day):
#   0 3 * * * /path/to/CRM_Project/scripts/backup.sh >> /path/to/CRM_Project/backups/cron.log 2>&1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/backups"

echo "Добавьте строку в crontab -e:"
echo
echo "0 3 * * * ${ROOT}/scripts/backup.sh >> ${ROOT}/backups/cron.log 2>&1"
echo
echo "Ротация: BACKUP_KEEP=14 (по умолчанию) в окружении cron или в backup.sh."
echo "Снимки пишутся в ${ROOT}/backups"
