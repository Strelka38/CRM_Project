#!/usr/bin/env bash
# Fix missing Quote mount/demount columns on a running docker compose stack.
# Usage (on the VPS, from /opt/CRM_Project):
#   bash scripts/fix-prod-db-columns.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_USER="${POSTGRES_USER:-crm}"
DB_NAME="${POSTGRES_DB:-crm_event}"

echo "==> Applying columns via postgres container (user=$DB_USER db=$DB_NAME)..."
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
\dt "Quote"
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDurationDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDurationDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "QuoteComment" ALTER COLUMN "body" SET DEFAULT '';
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imagePath" TEXT;
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageMime" TEXT;
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageName" TEXT;
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Quote' AND column_name ILIKE '%mount%'
ORDER BY 1;
SQL

echo "==> Restarting app..."
docker compose restart app

echo "Done. Open an event card again."
