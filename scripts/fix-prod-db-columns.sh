#!/usr/bin/env bash
# Fix missing columns on a running docker compose stack.
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

echo "==> Applying columns via postgres (user=$DB_USER db=$DB_NAME)..."
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "mountDurationDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "demountDurationDays" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "QuoteComment" ALTER COLUMN "body" SET DEFAULT '';
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imagePath" TEXT;
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageMime" TEXT;
ALTER TABLE "QuoteComment" ADD COLUMN IF NOT EXISTS "imageName" TEXT;

ALTER TABLE "QuoteAssignment" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "isFreelancer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "freelancerName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuoteAssignment" ADD COLUMN IF NOT EXISTS "owners" "CatalogOwner"[] DEFAULT ARRAY[]::"CatalogOwner"[];

SELECT 'Quote' AS tbl, column_name FROM information_schema.columns
WHERE table_name = 'Quote' AND column_name ILIKE '%mount%'
UNION ALL
SELECT 'QuoteAssignment', column_name FROM information_schema.columns
WHERE table_name = 'QuoteAssignment' AND column_name IN ('isFreelancer','freelancerName','owners','userId')
ORDER BY 1, 2;
SQL

echo "==> Restarting app..."
docker compose restart app

echo "Done. Hard-refresh the site and open an event."
