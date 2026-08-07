#!/usr/bin/env bash
# 시드 데이터를 적용한다 — WBS 2.2
#
#   pnpm seed                          # SUPABASE_DB_URL 또는 PG* 환경변수로 접속
#   pnpm seed -- "postgresql://..."    # 접속 문자열 직접 지정
#   SEED_DB=hannuri_matzip_verify pnpm seed   # 로컬 검증 DB 에 적용
#
# 접속 문자열은 Supabase 콘솔 › Project Settings › Database › Connection string
# 에서 가져온다. **비밀번호가 들어 있으니 커밋하지 말 것** — .env.local 에 두고
# `set -a; source .env.local; set +a` 로 넣거나 셸에서만 export 한다.
#
# 여러 번 돌려도 안전하다. 시드는 자기 행만 갱신하고 사용자 데이터는 건드리지 않는다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_SQL="$ROOT/supabase/seed.sql"

command -v psql >/dev/null 2>&1 || {
  echo "psql 이 필요합니다. PostgreSQL 클라이언트를 설치해 주세요." >&2
  echo "  macOS: brew install libpq && brew link --force libpq" >&2
  exit 1
}

if [ $# -gt 0 ]; then
  target=("$1")
elif [ -n "${SUPABASE_DB_URL:-}" ]; then
  target=("$SUPABASE_DB_URL")
elif [ -n "${SEED_DB:-}" ]; then
  target=(-d "$SEED_DB")
else
  echo "접속 대상이 없습니다. 셋 중 하나를 주세요:" >&2
  echo "  pnpm seed -- \"postgresql://postgres:...@db.xxx.supabase.co:5432/postgres\"" >&2
  echo "  SUPABASE_DB_URL=... pnpm seed" >&2
  echo "  SEED_DB=hannuri_matzip_verify pnpm seed" >&2
  exit 1
fi

echo "▶ 시드 적용"
psql -q -v ON_ERROR_STOP=1 "${target[@]}" -f "$SEED_SQL"

echo "▶ 결과"
psql -q -v ON_ERROR_STOP=1 "${target[@]}" -c "
  select '맛집' as 항목, count(*) from restaurants where is_active
  union all select '메뉴', count(*) from menus
  union all select '리뷰', count(*) from reviews
  order by 1;
"
