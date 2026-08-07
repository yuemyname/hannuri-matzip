-- RLS 정책 — SPEC.md §2.3
--
-- SPEC 이 명시한 것만 만든다. 정책이 없는 동작은 RLS 기본값에 따라 전부 거부된다.
-- SPEC 이 언급하지 않은 동작(메뉴 쓰기, 리뷰 사진 쓰기, 프로필 수정,
-- recommendation_logs 수정)은 여기 없으며, 그래서 지금은 막혀 있다.

alter table profiles            enable row level security;
alter table restaurants         enable row level security;
alter table menus               enable row level security;
alter table reviews             enable row level security;
alter table review_photos       enable row level security;
alter table recommendation_logs enable row level security;

-- ── select ───────────────────────────────────────────────────────────
-- 세션이 있으면 전부 조회 가능. 익명 세션도 authenticated 롤을 받는다 (§2.4).
-- 세션 없이 anon 키만 있는 요청은 롤이 anon 이라 여기서 걸러진다.
create policy profiles_select on profiles
  for select using (auth.role() = 'authenticated');

create policy restaurants_select on restaurants
  for select using (auth.role() = 'authenticated');

create policy menus_select on menus
  for select using (auth.role() = 'authenticated');

create policy reviews_select on reviews
  for select using (auth.role() = 'authenticated');

create policy review_photos_select on review_photos
  for select using (auth.role() = 'authenticated');

-- recommendation_logs 만 예외 — 본인 것만 보인다.
create policy recommendation_logs_select on recommendation_logs
  for select using (auth.role() = 'authenticated' and user_id = auth.uid());

-- ── restaurants 쓰기 ─────────────────────────────────────────────────
-- SPEC 은 insert 를 "authenticated" 라고만 적었지만 created_by 를 자기 자신으로
-- 묶는다. 안 묶으면 남의 id 로 등록할 수 있고, 그러면 update/delete 의
-- created_by = auth.uid() 검사가 무의미해진다.
create policy restaurants_insert on restaurants
  for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());

create policy restaurants_update on restaurants
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy restaurants_delete on restaurants
  for delete using (created_by = auth.uid());

-- ── reviews 쓰기 ─────────────────────────────────────────────────────
create policy reviews_insert on reviews
  for insert with check (user_id = auth.uid());

create policy reviews_update on reviews
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reviews_delete on reviews
  for delete using (user_id = auth.uid());

-- ── recommendation_logs 쓰기 ─────────────────────────────────────────
create policy recommendation_logs_insert on recommendation_logs
  for insert with check (user_id = auth.uid());

-- ── Storage: review-photos ───────────────────────────────────────────
-- 인증 사용자 읽기, 본인 경로({uid}/...)만 쓰기.
-- public=false 이므로 서명 URL 로만 내려간다.
insert into storage.buckets (id, name, public)
  values ('review-photos', 'review-photos', false)
  on conflict (id) do nothing;

-- `alter table storage.objects enable row level security` 는 여기 없다.
-- 실물 Supabase 에서 storage.objects 소유자는 supabase_storage_admin 이고,
-- postgres 로는 alter 가 안 된다 (`must be owner of table objects`).
-- 어차피 실물은 RLS 가 켜진 채로 온다. 로컬 검증용 활성화는 tests/shim.sql 이 한다.

create policy review_photos_object_select on storage.objects
  for select using (
    bucket_id = 'review-photos' and auth.role() = 'authenticated'
  );

create policy review_photos_object_insert on storage.objects
  for insert with check (
    bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy review_photos_object_update on storage.objects
  for update using (
    bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy review_photos_object_delete on storage.objects
  for delete using (
    bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
