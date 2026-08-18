-- spatial_ref_sys 쓰기를 트리거로 막는다 (2026-08-18, 앞 마이그레이션의 후속).
--
-- 20260818000000 이 RLS 를 켜려 했지만 실제 프로젝트에서는 **소유권이 없어
-- 실패했다** — 표 주인이 supabase_admin 이다 (PostGIS 확장이 화이트리스트
-- 경유로 superuser 권한으로 깔리면서 그쪽 소유가 됐다). 예외 방어가 경고만
-- 내고 지나갔고, CLI 는 서버 경고를 안 보여줘서 성공처럼 보였다.
--
-- ALTER 도 REVOKE 도 소유자·부여자만 할 수 있어 우리 롤로는 못 한다. 그런데
-- **TRIGGER 권한은 있다** (권한 목록으로 확인). 트리거는 소유권 없이도 달 수
-- 있고, BEFORE 문장 트리거에서 예외를 던지면 그 문장이 통째로 중단된다 —
-- anon 키로 SRID 정의를 고치던 구멍이 여기서 막힌다.
--
-- 읽기는 안 건드린다. PostGIS 가 geography 계산 중에 이 표를 읽고, 우리 RPC 는
-- 전부 invoker 라 authenticated 권한으로 읽는다.
--
-- ⚠️ 이 트리거는 **구멍을 막을 뿐, 경고는 못 지운다.** Advisor 는 RLS 플래그를
-- 보므로, 경고 제거는 소유자(supabase_admin)가 RLS 를 켜 줘야 한다 — Supabase
-- 지원 티켓으로 요청한다. 그쪽이 켜져도 이 트리거는 그대로 두면 된다 (겹벽).

create or replace function public.spatial_ref_sys_guard()
returns trigger
language plpgsql
as $$
begin
  -- postgres 는 마이그레이션·관리용이고, supabase_admin 은 PostGIS 업그레이드가
  -- 이 표를 손본다. 둘을 막으면 확장 업그레이드가 통째로 터진다.
  if current_user in ('postgres', 'supabase_admin') then
    return null;
  end if;
  -- 42501(insufficient_privilege) 로 던진다. 권한이 걷힌 환경과 같은 에러라야
  -- 클라이언트가 두 경우를 구분해서 다르게 굴 일이 없다.
  raise exception 'spatial_ref_sys 는 읽기 전용입니다'
    using errcode = '42501';
end;
$$;

do $$
begin
  -- DROP TRIGGER 는 소유자만 할 수 있어 만들기 전 존재 확인으로 갈음한다.
  -- (마이그레이션은 한 번만 돌지만, 로컬 검증처럼 다시 도는 환경이 있다)
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.spatial_ref_sys'::regclass
       and tgname = 'spatial_ref_sys_read_only'
  ) then
    create trigger spatial_ref_sys_read_only
      before insert or update or delete or truncate
      on public.spatial_ref_sys
      for each statement
      execute function public.spatial_ref_sys_guard();
  end if;
exception when insufficient_privilege then
  raise warning 'spatial_ref_sys 에 트리거를 못 달았다 — TRIGGER 권한을 확인할 것';
end
$$;
