#!/bin/sh
set -eu

echo "==> Waiting for database..."
i=0
until node -e "const n=require('net');const s=n.connect(5432,'db',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "Database is not ready after 60s" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Applying migrations..."
npx prisma migrate deploy

echo "==> Bootstrapping (safe if already initialized)..."
npx tsx prisma/seed.ts

echo "==> Starting application..."
exec "$@"
