-- Supabase shim — 검증 전용. 애플리케이션 스키마가 아니다.
--
-- 로컬 Postgres 에는 Supabase 가 기본 제공하는 것들(auth 스키마, anon/authenticated 롤,
-- auth.uid() / auth.role())이 없다. 마이그레이션이 그것들을 참조하므로 여기서 흉내낸다.
--
-- ⚠️ 실제 Supabase(로컬 스택·클라우드)에는 절대 적용하지 말 것. 거기엔 진짜가 이미 있고,
--    이 파일이 덮어쓰면 인증이 망가진다. supabase/migrations/ 밖에 두는 이유가 이것이다.

create schema if not exists auth;

-- profiles.id 가 참조한다. 실물에는 컬럼이 훨씬 많지만 검증에 필요한 것만 둔다.
create table if not exists auth.users (
  id    uuid primary key,
  email text
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

-- PostgREST 가 JWT 클레임을 request.jwt.claims 에 넣어주는 것을 흉내낸다.
-- 테스트에서는 set_config('request.jwt.claims', '{"sub":"...","role":"..."}', false) 로 설정한다.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'role', ''), 'anon');
$$;

-- ── Storage ──────────────────────────────────────────────────────────
-- Supabase Storage 가 만드는 것들. 마이그레이션이 버킷을 만들고 storage.objects 에
-- 정책을 걸기 때문에 없으면 적용 자체가 안 된다.
-- ⚠️ 실물과 컬럼이 다르다. 여기서 통과해도 실제 Storage 동작을 보장하지 않는다.
create schema if not exists storage;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text not null,
  owner     uuid
);

-- 'uid/2026/a.webp' → {uid,2026}. 경로 첫 조각으로 소유자를 판별하는 데 쓴다.
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)];
$$;

-- 익명 세션도 authenticated 롤을 받는다 (is_anonymous 클레임으로만 구분된다).
-- 이후 마이그레이션이 만드는 테이블에 권한이 붙도록 default privileges 로 걸어둔다.
grant usage on schema public, storage, auth to anon, authenticated;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
