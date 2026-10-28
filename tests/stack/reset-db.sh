#!/usr/bin/env bash
# ล้างข้อมูลแอปแล้วรัน migration ใหม่ทั้งหมด (เฉพาะเครื่องทดสอบ)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_URL="${DB_URL:-postgres://postgres:postgres@127.0.0.1:54322/postgres}"
export PGOPTIONS="--client-min-messages=warning"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
drop trigger if exists on_auth_user_created on auth.users;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;
delete from storage.objects;
delete from storage.buckets;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
delete from auth.users;
SQL
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/stack/bootstrap.sql" 2>&1 | grep -v NOTICE || true
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" || { echo "FAILED: $f"; exit 1; }
done
psql "$DB_URL" -q -c "notify pgrst, 'reload schema';"
echo "db reset ok"
