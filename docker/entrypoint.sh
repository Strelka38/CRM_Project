#!/bin/sh
set -eu

host="${POSTGRES_HOST:-db}"
port="${POSTGRES_PORT:-5432}"
echo "==> Waiting for database at ${host}:${port}..."
i=0
until node -e "const n=require('net');const h=process.env.POSTGRES_HOST||'db';const p=Number(process.env.POSTGRES_PORT||5432);const s=n.connect(p,h,()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "Database is not ready after 60s (${host}:${port})" >&2
    exit 1
  fi
  sleep 1
done

echo "==> Applying migrations..."
if ! npx prisma migrate deploy; then
  echo "WARN: migrate deploy failed — continuing" >&2
fi

echo "==> Ensuring quote schedule / chat image columns..."
if ! npx prisma db execute --schema prisma/schema.prisma --file prisma/ensure-columns.sql; then
  echo "WARN: db execute failed — trying TS ensure-schema" >&2
fi
if ! npx tsx prisma/ensure-schema.ts; then
  echo "WARN: ensure-schema failed — app will still start" >&2
fi

echo "==> Bootstrapping (safe if already initialized)..."
if ! npx tsx prisma/seed.ts; then
  echo "WARN: seed failed — app will still start" >&2
fi

echo "==> Starting application..."
exec "$@"
