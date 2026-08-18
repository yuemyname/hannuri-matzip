-- spatial_ref_sys 를 잠근다 (2026-08-18, Supabase 보안 경고 rls_disabled_in_public).
--
-- 이 표는 우리가 만든 게 아니다 — `create extension postgis` 가 public 스키마에
-- 만드는 좌표계(SRID) 정의표다. 문제는 Supabase 의 기본 권한이 public 의 새 표에
-- anon/authenticated 의 **쓰기까지** 얹는다는 것: 익명 키만 있으면 SRID 정의를
-- 고치거나 지울 수 있었다. 4326 이 뒤틀리면 모든 거리 계산이 조용히 틀어진다.
--
-- 확장을 extensions 스키마로 옮기는 정공법은 못 쓴다. PostGIS 는 재배치가
-- 안 되는 확장이라(`alter extension … set schema` 거부) 옮기려면 지웠다 다시
-- 만들어야 하는데, 그러면 geography 컬럼이 통째로 딸려 나간다.
--
-- 그래서 표를 그 자리에서 잠근다:
--   1) RLS 를 켠다 — 경고가 보는 것이 정확히 이 플래그다.
--   2) 읽기 정책을 모두에게 연다. **읽기는 막으면 안 된다** — PostGIS 가
--      geography 계산 중에 이 표를 읽는데, 우리 RPC 는 전부 invoker 라
--      authenticated 권한으로 읽는다. 막히면 조회가 통째로 터진다.
--   3) 쓰기 권한을 걷는다. 쓰기 정책은 안 만들었으니 RLS 만으로도 막히지만,
--      권한까지 걷어야 경고 목록(security definer 경유 등)이 깨끗해진다.
--
-- 전부 예외 방어로 감싼다. 이 표의 주인은 확장을 만든 롤이라, 다른 권한으로
-- 마이그레이션을 돌리는 환경(로컬 검증 등)에서는 소유권이 없을 수 있다 —
-- 그때 여기서 터지면 뒤의 마이그레이션까지 다 막힌다.

do $$
begin
  begin
    alter table public.spatial_ref_sys enable row level security;
  exception when insufficient_privilege then
    raise warning 'spatial_ref_sys 소유권이 없어 RLS 를 못 켰다. 소유자로 다시 실행할 것';
  end;

  begin
    drop policy if exists spatial_ref_sys_select on public.spatial_ref_sys;
    create policy spatial_ref_sys_select on public.spatial_ref_sys
      for select using (true);
  exception when insufficient_privilege then
    raise warning 'spatial_ref_sys 읽기 정책을 못 만들었다';
  end;

  begin
    revoke insert, update, delete, truncate, references, trigger
      on table public.spatial_ref_sys from anon, authenticated;
  exception when insufficient_privilege or undefined_object then
    raise warning 'spatial_ref_sys 쓰기 권한을 못 걷었다';
  end;
end
$$;
