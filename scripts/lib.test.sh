#!/usr/bin/env bash
# Tests for scripts/lib.sh helpers. Run: bash scripts/lib.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/crm-lib-test.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

cat >"$tmp" <<'EOF'
DOMAIN="old.example.com"
POSTGRES_USER="crm"
BOOTSTRAP_MANAGER_EMAIL="old@example.com"
EOF

set_env_key DOMAIN "new.example.com" "$tmp"
set_env_key AUTH_URL "https://new.example.com" "$tmp"
set_env_key BOOTSTRAP_MANAGER_PASSWORD 'p"ass$word' "$tmp"

grep -q 'DOMAIN="new.example.com"' "$tmp" || fail "DOMAIN not updated"
grep -q 'AUTH_URL="https://new.example.com"' "$tmp" || fail "AUTH_URL not appended"
grep -q 'POSTGRES_USER="crm"' "$tmp" || fail "unrelated key lost"
# $ → $$ for Compose; " escaped
expected='BOOTSTRAP_MANAGER_PASSWORD="p\"ass$$word"'
grep -Fq "$expected" "$tmp" || fail "env_escape mismatch: $(cat "$tmp")"

[[ "$(sql_lit "O'Brien")" == "'O''Brien'" ]] || fail "sql_lit quotes"
[[ "$(sql_lit '$2a$10$abc')" == "'\$2a\$10\$abc'" ]] || fail "sql_lit dollar: $(sql_lit '$2a$10$abc')"

unset POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD
[[ "$(db_host)" == "db" ]] || fail "default db_host"
[[ "$(db_port)" == "5432" ]] || fail "default db_port"
using_local_db || fail "default host should be local"

POSTGRES_HOST="db"
using_local_db || fail "db is local"
POSTGRES_HOST="localhost"
using_local_db || fail "localhost is local"
POSTGRES_HOST="127.0.0.1"
using_local_db || fail "127.0.0.1 is local"
POSTGRES_HOST="1.2.3.4"
using_local_db && fail "1.2.3.4 should be remote"
[[ "$(db_host)" == "1.2.3.4" ]] || fail "db_host remote"
POSTGRES_PORT="15432"
POSTGRES_USER="crm"
POSTGRES_PASSWORD="s3cret"
POSTGRES_DB="crm_event"
[[ "$(database_url_value)" == "postgresql://crm:s3cret@1.2.3.4:15432/crm_event?schema=public" ]] || fail "database_url_value: $(database_url_value)"
unset POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB

echo "scripts/lib.test.sh ok"
