#!/usr/bin/env bash
# เปิดระบบหลังบ้านแบบเดียวกับ Supabase บนเครื่องโดยไม่ต้องใช้ Docker (สำหรับทดสอบและ CI)
# Starts a Supabase-compatible stack (GoTrue + PostgREST + storage stub) without Docker.
# Requires: a running Postgres reachable at $DB_URL (superuser "postgres"), psql, node, curl.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="${STACK_DIR:-$ROOT/.stack}"
DB_URL="${DB_URL:-postgres://postgres:postgres@127.0.0.1:54322/postgres}"
DB_HOSTPORT="$(echo "$DB_URL" | sed -E 's#.*@([^/]+)/.*#\1#')"
DB_NAME="$(echo "$DB_URL" | sed -E 's#.*/([^/?]+).*#\1#')"
export JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
SITE_URL="${SITE_URL:-http://localhost:3000}"
AUTH_VERSION=2.177.0
PGRST_VERSION=12.2.3

mkdir -p "$STACK/bin" "$STACK/logs" "$STACK/files"

if [ ! -x "$STACK/bin/postgrest" ]; then
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/v$PGRST_VERSION/postgrest-v$PGRST_VERSION-linux-static-x64.tar.xz" | tar -xJ -C "$STACK/bin"
fi
if [ ! -x "$STACK/auth/auth" ]; then
  mkdir -p "$STACK/auth"
  curl -sSL "https://github.com/supabase/auth/releases/download/v$AUTH_VERSION/auth-v$AUTH_VERSION-x86.tar.gz" | tar -xz -C "$STACK/auth"
fi

"$ROOT/tests/stack/stop.sh" >/dev/null 2>&1 || true

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/stack/bootstrap.sql"

GOTRUE_API_HOST=127.0.0.1 \
PORT=9999 \
API_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1" \
GOTRUE_DB_DRIVER=postgres \
GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@$DB_HOSTPORT/$DB_NAME?sslmode=disable" \
GOTRUE_DB_MIGRATIONS_PATH="$STACK/auth/migrations" \
GOTRUE_SITE_URL="$SITE_URL" \
GOTRUE_URI_ALLOW_LIST="$SITE_URL/**" \
GOTRUE_JWT_SECRET="$JWT_SECRET" \
GOTRUE_JWT_EXP=3600 \
GOTRUE_JWT_AUD=authenticated \
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
GOTRUE_JWT_ADMIN_ROLES=service_role \
GOTRUE_DISABLE_SIGNUP=false \
GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
GOTRUE_MAILER_AUTOCONFIRM=true \
GOTRUE_EXTERNAL_PHONE_ENABLED=false \
GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
GOTRUE_LOG_LEVEL=warn \
nohup "$STACK/auth/auth" >"$STACK/logs/auth.log" 2>&1 &
echo $! >"$STACK/auth.pid"
node "$ROOT/tests/stack/wait-for.mjs" "http://127.0.0.1:9999/health" 90

shopt -s nullglob
if [ "$(psql "$DB_URL" -tAc "select to_regclass('public.profiles') is null")" = "t" ]; then
  for f in "$ROOT"/supabase/migrations/*.sql; do
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  done
else
  echo "migrations already applied (use tests/stack/reset-db.sh to rebuild)"
fi

PGRST_DB_URI="postgres://authenticator:postgres@$DB_HOSTPORT/$DB_NAME" \
PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_PORT=3001 \
PGRST_DB_POOL=10 \
PGRST_DB_CHANNEL_ENABLED=true \
nohup "$STACK/bin/postgrest" >"$STACK/logs/rest.log" 2>&1 &
echo $! >"$STACK/rest.pid"

JWT_SECRET="$JWT_SECRET" DB_URL="$DB_URL" STORAGE_DIR="$STACK/files" \
nohup node "$ROOT/tests/stack/gateway.mjs" >"$STACK/logs/gateway.log" 2>&1 &
echo $! >"$STACK/gateway.pid"

node "$ROOT/tests/stack/wait-for.mjs" "http://127.0.0.1:3001/" 60
node "$ROOT/tests/stack/wait-for.mjs" "http://127.0.0.1:54321/health" 30

node "$ROOT/tests/stack/keys.mjs" >"$STACK/keys.env"
echo "stack ready: http://127.0.0.1:54321 (keys in $STACK/keys.env)"
