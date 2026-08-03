#!/usr/bin/env bash
# Build the app image on a strong machine, then ship it to the VPS.
# Usage:
#   ./scripts/docker-build-export.sh              # writes crm-app.tar.gz
#   ./scripts/docker-build-export.sh user@host:/opt/CRM_Project
# On the VPS after scp:
#   docker load < crm-app.tar.gz
#   docker compose up -d

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE_NAME:-crm-app:latest}"
OUT="${OUT_FILE:-crm-app.tar.gz}"

echo "==> Building $IMAGE (BuildKit cache enabled, no --no-cache)"
DOCKER_BUILDKIT=1 docker build -t "$IMAGE" -f Dockerfile .

echo "==> Saving $OUT"
docker save "$IMAGE" | gzip -1 > "$OUT"
ls -lh "$OUT"

DEST="${1:-}"
if [[ -n "$DEST" ]]; then
  echo "==> Uploading to $DEST"
  scp "$OUT" "$DEST/"
  echo "On the server:"
  echo "  cd /opt/CRM_Project && gunzip -c crm-app.tar.gz | docker load"
  echo "  docker compose up -d"
fi
