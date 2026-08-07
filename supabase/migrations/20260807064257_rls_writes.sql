-- 나머지 쓰기 정책 — SPEC.md §2.3 표
--
-- 20260807061518_rls.sql 은 SPEC 이 그때 명시한 것만 만들었고, 나머지 쓰기는
-- 정책이 없어 거부 상태였다. SPEC §2.3 이 표로 확정되면서 여기서 채운다.

-- profiles — 닉네임 변경 (§4.5). insert 는 §2.4 트리거가, delete 는 cascade 가 한다.
create policy profiles_update on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- menus — 등록자로 묶지 않는다. 이유는 SPEC §2.3, 리스크는 §8.
create policy menus_insert on menus
  for insert with check (auth.role() = 'authenticated');

create policy menus_update on menus
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy menus_delete on menus
  for delete using (auth.role() = 'authenticated');

-- review_photos — 상위 리뷰의 소유자만.
create policy review_photos_insert on review_photos
  for insert with check (
    exists (select 1 from reviews rv
             where rv.id = review_id and rv.user_id = auth.uid())
  );

create policy review_photos_update on review_photos
  for update using (
    exists (select 1 from reviews rv
             where rv.id = review_id and rv.user_id = auth.uid())
  ) with check (
    exists (select 1 from reviews rv
             where rv.id = review_id and rv.user_id = auth.uid())
  );

create policy review_photos_delete on review_photos
  for delete using (
    exists (select 1 from reviews rv
             where rv.id = review_id and rv.user_id = auth.uid())
  );

-- recommendation_logs — 뽑을 때 accepted = null 로 insert 하고,
-- [여기로]/[다시] 를 누르면 그 행을 update 한다 (§4.2).
create policy recommendation_logs_update on recommendation_logs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
