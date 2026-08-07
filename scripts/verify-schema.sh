#!/usr/bin/env bash
# 로컬 Postgres(+PostGIS)에 마이그레이션을 처음부터 적용하고 스키마를 검증한다.
#
# Docker 를 못 쓰는 환경(`supabase start` 불가)에서 쓰는 대용품이다.
# Supabase 로컬 스택을 띄울 수 있으면 `pnpm supabase db reset` 이 정본이고,
# 이 스크립트는 그걸 대신하지 못한다 — auth·storage 같은 서비스는 검증하지 않는다.
#
#   pnpm db:verify
#   VERIFY_DB=other_name pnpm db:verify
#
# 접속은 표준 PG* 환경변수를 따른다(PGHOST/PGPORT/PGUSER/PGPASSWORD).
# 유닉스 소켓 peer 인증만 열린 머신에서는 postgres 유저로 실행한다:
#   sudo -u postgres bash scripts/verify-schema.sh

set -euo pipefail

DB="${VERIFY_DB:-hannuri_matzip_verify}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v psql >/dev/null 2>&1 || {
  echo "psql 이 필요합니다. PostgreSQL 클라이언트를 설치해 주세요." >&2
  exit 1
}

run() { psql -q -v ON_ERROR_STOP=1 "$@"; }

echo "▶ $DB 재생성"
run -d postgres -c "drop database if exists $DB;" -c "create database $DB;"

echo "▶ Supabase shim 적용"
run -d "$DB" -f "$ROOT/supabase/tests/shim.sql"

echo "▶ 마이그레이션 적용"
shopt -s nullglob
migrations=("$ROOT"/supabase/migrations/*.sql)
if [ ${#migrations[@]} -eq 0 ]; then
  echo "supabase/migrations/ 에 마이그레이션이 없습니다." >&2
  exit 1
fi
for f in "${migrations[@]}"; do
  echo "   $(basename "$f")"
  run -d "$DB" -f "$f"
done

echo "▶ 검증"
run -d "$DB" -f "$ROOT/supabase/tests/schema.test.sql"
