-- 스키마 검증 — shim.sql + supabase/migrations/* 적용 후 실행한다.
-- 실패하면 exception 을 던진다. psql -v ON_ERROR_STOP=1 로 실행할 것.
-- 버리는 DB 를 전제로 하므로 픽스처를 정리하지 않는다.

\set QUIET on
set client_min_messages to warning;

-- ── 1. 객체 ──────────────────────────────────────────────────────────
do $$
declare n int;
begin
  -- spatial_ref_sys 는 PostGIS 가 만드는 것이라 앱 테이블에서 뺀다.
  select count(*) into n
    from information_schema.tables
   where table_schema = 'public'
     and table_type = 'BASE TABLE'
     and table_name <> 'spatial_ref_sys';
  -- categories 가 늘어 7개다 (2026-08-09, 종류 목록을 코드에서 DB 로 옮겼다).
  if n <> 7 then
    raise exception '앱 테이블 7개를 기대했는데 %개다', n;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.restaurant_stats') is null then
    raise exception 'restaurant_stats 뷰가 없다';
  end if;
end
$$;

do $$
declare missing text;
begin
  select string_agg(want, ', ') into missing
    from unnest(array['restaurants_location_idx',
                      'restaurants_name_loc_uniq',
                      'reco_logs_user_created_idx',
                      'restaurants_category_idx']) as want
   where not exists (
     select 1 from pg_indexes where schemaname = 'public' and indexname = want
   );
  if missing is not null then
    raise exception '인덱스가 없다: %', missing;
  end if;
end
$$;

-- ── 픽스처 ───────────────────────────────────────────────────────────
-- profiles 는 여기서 안 만든다. on_auth_user_created 트리거가 만든다 (§2.4).
-- 직접 넣으면 pkey 충돌이 나는데, 그 충돌이야말로 트리거가 돌았다는 증거다.
insert into auth.users(id, email)
  values ('11111111-1111-1111-1111-111111111111', null);

-- 트리거가 안 돌면 아래 픽스처가 FK 위반으로 죽는데, 그 메시지로는 원인이 안 보인다.
-- 여기서 먼저 잡는다.
do $$
begin
  if not exists (select 1 from profiles
                  where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'auth.users 삽입에 profiles 가 따라오지 않았다 (on_auth_user_created 미동작)';
  end if;
end
$$;

insert into restaurants(name, category, location, price_range, created_by)
  values ('김밥천국', '분식', st_makepoint(126.9780, 37.5665)::geography, 1,
          '11111111-1111-1111-1111-111111111111');

-- ── 2. 제약 ──────────────────────────────────────────────────────────
-- category: 목록에 없는 값이 조용히 들어가면 안 된다. 들어가는 순간 SPEC §3.1 의
-- category = any(...) 매칭이 실패해 그 맛집이 필터·점메추에서 에러 없이 사라진다.
-- 2026-08-09 부터 붙박이 check 가 아니라 categories 를 가리키는 **외래키**다.
do $$
begin
  begin
    insert into restaurants(name, category, location, created_by)
      values ('오타집', '한식 ', st_makepoint(126.979, 37.567)::geography,
              '11111111-1111-1111-1111-111111111111');
    raise exception 'category 뒤 공백(''한식 '')이 거부되지 않았다';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into restaurants(name, category, location, created_by)
      values ('커피집', '커피', st_makepoint(126.979, 37.567)::geography,
              '11111111-1111-1111-1111-111111111111');
    raise exception '목록에 없는 category(''커피'')가 거부되지 않았다';
  exception when foreign_key_violation then null;
  end;
end
$$;

-- categories 이름 규칙 — 폼(categoryError)과 같은 뜻이어야 한다.
-- 갈라지면 폼은 통과시키는데 저장이 실패한다.
do $$
declare bad text;
begin
  foreach bad in array array['한식1', '아시안!', ' 한식', '한식 ', '한  식', '']
  loop
    begin
      insert into categories(name) values (bad);
      raise exception '못 쓰는 이름 %s 가 거부되지 않았다', quote_literal(bad);
    exception when check_violation then null;
    end;
  end loop;

  -- 낱말 사이 공백 한 칸과 영문은 통과해야 한다.
  insert into categories(name) values ('아시안 요리'), ('Brunch Cafe');
end
$$;

-- 이름을 고치면 붙어 있던 맛집이 따라온다 (on update cascade).
-- 관리자 화면이 이걸 그대로 쓴다 — 안 따라오면 이름 하나 고치다 맛집이 사라진다.
do $$
declare n int;
begin
  insert into categories(name) values ('임시종류');
  insert into restaurants(name, category, location, created_by)
    values ('이름바뀔집', '임시종류', st_makepoint(126.979, 37.567)::geography,
            '11111111-1111-1111-1111-111111111111');

  update categories set name = '바뀐종류' where name = '임시종류';
  select count(*) into n from restaurants where name = '이름바뀔집' and category = '바뀐종류';
  if n <> 1 then
    raise exception '종류 이름을 고쳤는데 맛집이 안 따라왔다 (on update cascade 없음)';
  end if;

  -- 쓰이는 중인 종류는 못 지운다 (on delete restrict). 지우려면 먼저 옮겨야 한다.
  begin
    delete from categories where name = '바뀐종류';
    raise exception '쓰이는 중인 종류가 지워졌다 (on delete restrict 없음)';
  exception when foreign_key_violation then null;
  end;

  delete from restaurants where name = '이름바뀔집';
  delete from categories where name = '바뀐종류';
end
$$;

do $$
declare rid uuid;
begin
  select id into rid from restaurants where name = '김밥천국';

  begin
    insert into reviews(restaurant_id, user_id, rating)
      values (rid, '11111111-1111-1111-1111-111111111111', 6);
    raise exception 'rating 6 이 거부되지 않았다';
  exception when check_violation then null;
  end;

  -- 1인 1맛집 1리뷰 — 두 번째는 거부되고, 앱은 upsert 로 처리한다 (WBS 3.2)
  insert into reviews(restaurant_id, user_id, rating)
    values (rid, '11111111-1111-1111-1111-111111111111', 5);
  begin
    insert into reviews(restaurant_id, user_id, rating)
      values (rid, '11111111-1111-1111-1111-111111111111', 3);
    raise exception '같은 유저의 두 번째 리뷰가 거부되지 않았다';
  exception when unique_violation then null;
  end;

  begin
    insert into recommendation_logs(user_id, restaurant_id, meal_type)
      values ('11111111-1111-1111-1111-111111111111', rid, 'brunch');
    raise exception 'meal_type ''brunch'' 가 거부되지 않았다';
  exception when check_violation then null;
  end;
end
$$;

do $$
begin
  begin
    insert into restaurants(name, category, location, created_by)
      values ('김밥천국', '분식', st_makepoint(126.9780, 37.5665)::geography,
              '11111111-1111-1111-1111-111111111111');
    raise exception '같은 이름·좌표 중복 등록이 거부되지 않았다';
  exception when unique_violation then null;
  end;
end
$$;

-- ── 3. 집계 뷰 ───────────────────────────────────────────────────────
do $$
declare avg_r numeric; cnt bigint;
begin
  select s.avg_rating, s.review_count into avg_r, cnt
    from restaurant_stats s join restaurants r on r.id = s.restaurant_id
   where r.name = '김밥천국';
  if avg_r <> 5.0 or cnt <> 1 then
    raise exception '리뷰 1건 맛집의 집계가 5.0/1 이 아니라 %/% 다', avg_r, cnt;
  end if;

  -- 리뷰 0건이어도 행이 나와야 한다 (left join + coalesce). null 이면 리스트가 빈다.
  insert into restaurants(name, category, location, created_by)
    values ('신규집', '기타', st_makepoint(126.98, 37.57)::geography,
            '11111111-1111-1111-1111-111111111111');
  select s.avg_rating, s.review_count into avg_r, cnt
    from restaurant_stats s join restaurants r on r.id = s.restaurant_id
   where r.name = '신규집';
  if avg_r <> 0 or cnt <> 0 then
    raise exception '리뷰 0건 맛집의 집계가 0/0 이 아니라 %/% 다', avg_r, cnt;
  end if;
end
$$;

-- ── 4. RLS (SPEC §2.3) ───────────────────────────────────────────────
-- 두 번째 사용자. 남의 것을 건드릴 수 있는지 확인하는 데 쓴다.
insert into auth.users(id, email)
  values ('22222222-2222-2222-2222-222222222222', null);
insert into recommendation_logs(user_id, restaurant_id, meal_type)
  select '11111111-1111-1111-1111-111111111111', id, 'lunch'
    from restaurants where name = '김밥천국';

do $$
declare n int;
begin
  select count(*) into n
    from pg_tables
   where schemaname = 'public' and rowsecurity
     and tablename in ('profiles','restaurants','menus','reviews',
                       'review_photos','recommendation_logs');
  if n <> 6 then
    raise exception 'RLS 가 켜진 앱 테이블이 6개가 아니라 %개다', n;
  end if;
end
$$;

-- 롤을 바꾸면 그 안에서는 결과를 못 들고 나오므로 밖에 받아둔다.
create table _rls(k text primary key, v bigint);

-- 세션 없음(anon 키만) — 아무것도 안 보여야 한다. DoD 전반부.
set role anon;
reset request.jwt.claims;
insert into _rls values ('anon_restaurants', (select count(*) from restaurants));
insert into _rls values ('anon_profiles',    (select count(*) from profiles));
reset role;

-- 세션 있음 — 보여야 한다. DoD 후반부.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into _rls values ('auth_restaurants', (select count(*) from restaurants));
insert into _rls values ('auth_own_logs',    (select count(*) from recommendation_logs));
reset role;

-- 남의 추천 로그는 안 보여야 한다 (SPEC: 본인 것만).
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into _rls values ('other_logs', (select count(*) from recommendation_logs));
-- 남의 맛집 수정은 0행이어야 한다 (RLS 는 에러가 아니라 행을 걸러낸다).
with upd as (
  update restaurants set memo = '남이 고침' where name = '김밥천국' returning 1
)
insert into _rls select 'other_update_rows', count(*) from upd;
reset role;

do $$
declare v bigint;
begin
  select _rls.v into v from _rls where k = 'anon_restaurants';
  if v <> 0 then raise exception '세션 없이 restaurants 가 %건 보인다 (0이어야 한다)', v; end if;

  select _rls.v into v from _rls where k = 'anon_profiles';
  if v <> 0 then raise exception '세션 없이 profiles 가 %건 보인다 (0이어야 한다)', v; end if;

  select _rls.v into v from _rls where k = 'auth_restaurants';
  if v = 0 then raise exception '세션이 있는데 restaurants 가 0건이다'; end if;

  select _rls.v into v from _rls where k = 'auth_own_logs';
  if v <> 1 then raise exception '본인 추천 로그가 1건이 아니라 %건이다', v; end if;

  select _rls.v into v from _rls where k = 'other_logs';
  if v <> 0 then raise exception '남의 추천 로그가 %건 보인다 (0이어야 한다)', v; end if;

  select _rls.v into v from _rls where k = 'other_update_rows';
  if v <> 0 then raise exception '남의 맛집을 %행 수정했다 (0이어야 한다)', v; end if;
end
$$;

-- 남의 id 로 리뷰를 쓰거나 맛집을 등록하면 정책 위반이어야 한다.
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  begin
    insert into reviews(restaurant_id, user_id, rating)
      select id, '11111111-1111-1111-1111-111111111111', 1
        from restaurants where name = '김밥천국';
    raise exception '남의 user_id 로 리뷰가 작성됐다';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into restaurants(name, category, location, created_by)
      values ('사칭집', '한식', st_makepoint(126.99, 37.58)::geography,
              '11111111-1111-1111-1111-111111111111');
    raise exception '남의 id 를 created_by 로 맛집이 등록됐다';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- ── 4b. 쓰기 정책 (SPEC §2.3 표) ─────────────────────────────────────
-- 본인 것: 되어야 한다 / 남의 것: 막혀야 한다.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare rid uuid; rvid uuid; n int;
begin
  select id into rid from restaurants where name = '김밥천국';
  select id into rvid from reviews
   where user_id = '11111111-1111-1111-1111-111111111111' limit 1;

  -- profiles: 본인 닉네임 변경
  update profiles set display_name = '바꾼이름'
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '본인 닉네임을 못 바꿨다 (%행)', n; end if;

  -- menus: 세션만 있으면 누구나 (SPEC §2.3)
  insert into menus(restaurant_id, name, price, is_signature)
    values (rid, '참치김밥', 4000, true);

  -- review_photos: 본인 리뷰에 붙이기
  insert into review_photos(review_id, storage_path)
    values (rvid, '11111111-1111-1111-1111-111111111111/a.webp');

  -- recommendation_logs: 본인 로그 수락 처리
  update recommendation_logs set accepted = true
   where user_id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 1 then raise exception '본인 추천 로그를 못 고쳤다 (%행)', n; end if;
end
$$;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare rvid uuid; n int;
begin
  -- 남의 닉네임은 못 바꾼다 (RLS 는 행을 걸러내므로 0행)
  update profiles set display_name = '남이바꿈'
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception '남의 닉네임을 %행 바꿨다', n; end if;

  -- 남의 추천 로그도 못 고친다
  update recommendation_logs set accepted = false;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '남의 추천 로그를 %행 고쳤다', n; end if;

  -- 남의 리뷰에 사진을 못 붙인다
  select id into rvid from reviews
   where user_id = '11111111-1111-1111-1111-111111111111' limit 1;
  begin
    insert into review_photos(review_id, storage_path)
      values (rvid, '22222222-2222-2222-2222-222222222222/x.webp');
    raise exception '남의 리뷰에 사진이 붙었다';
  exception when insufficient_privilege then null;
  end;

  -- 남의 리뷰 사진도 못 지운다
  delete from review_photos;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '남의 리뷰 사진을 %행 지웠다', n; end if;

  -- 메뉴는 남이 만든 것도 고칠 수 있다 (의도된 동작, SPEC §2.3 / §8)
  update menus set price = 4500;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '메뉴를 누구나 고칠 수 있어야 하는데 %행이다', n; end if;
end
$$;
reset role;

-- ── 5. Storage (SPEC §2.3) ───────────────────────────────────────────
-- ⚠️ shim 의 storage 는 실물과 컬럼이 다른 근사치다. 여기 통과는 정책이
--    "붙어 있고 경로 판별이 의도대로 동작한다" 까지만 보증한다.
do $$
declare n int;
begin
  if not exists (select 1 from storage.buckets where id = 'review-photos') then
    raise exception 'review-photos 버킷이 없다';
  end if;
  if (select public from storage.buckets where id = 'review-photos') then
    raise exception 'review-photos 버킷이 public 이다 (비공개여야 한다)';
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'review_photos_object_%';
  if n <> 4 then
    raise exception 'storage.objects 의 review-photos 정책이 4개가 아니라 %개다', n;
  end if;

  if (storage.foldername('11111111-1111-1111-1111-111111111111/2026/a.webp'))[1]
     <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'foldername 이 경로 첫 조각을 소유자로 뽑지 못한다';
  end if;
end
$$;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  -- 본인 경로 — 되어야 한다
  insert into storage.objects(bucket_id, name)
    values ('review-photos', '11111111-1111-1111-1111-111111111111/a.webp');

  -- 남의 경로 — 막혀야 한다
  begin
    insert into storage.objects(bucket_id, name)
      values ('review-photos', '22222222-2222-2222-2222-222222222222/b.webp');
    raise exception '남의 경로에 업로드가 됐다';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;


-- ── 6. restaurants_within RPC (SPEC §3.1) ────────────────────────────
-- 이 절은 대량 데이터를 넣으므로 반드시 맨 뒤에 둔다.

do $$
begin
  if to_regprocedure('restaurants_within(double precision, double precision, integer, text[], numeric)') is null then
    raise exception 'restaurants_within 함수가 없다';
  end if;
end
$$;

-- 기준점(시청역) 주변에 알려진 거리로 몇 개 심는다.
-- 위도 1도 ≈ 111.32km 이므로 미터를 위도 증분으로 환산한다.
insert into restaurants(name, category, location, price_range, created_by)
select
  '거리테스트' || d || 'm',
  '한식',
  st_makepoint(126.9780, 37.5665 + d / 111320.0)::geography,
  2,
  '11111111-1111-1111-1111-111111111111'
from unnest(array[20, 80, 150, 400]) as d;

do $$
declare names text[];
begin
  -- 반경 200m: 20 / 80 / 150 만 들어오고 400 은 빠져야 한다. 가까운 순서대로.
  select array_agg(w.name order by w.distance_m)
    into names
    from restaurants_within(37.5665, 126.9780, 200) w
   where w.name like '거리테스트%';

  if names <> array['거리테스트20m','거리테스트80m','거리테스트150m'] then
    raise exception '반경 200m 결과가 예상과 다르다: %', names;
  end if;

  -- 반경 50m 로 좁히면 20m 짜리만 남는다
  select array_agg(w.name) into names
    from restaurants_within(37.5665, 126.9780, 50) w
   where w.name like '거리테스트%';
  if names <> array['거리테스트20m'] then
    raise exception '반경 50m 결과가 예상과 다르다: %', names;
  end if;

  -- 카테고리 필터
  select array_agg(w.name) into names
    from restaurants_within(37.5665, 126.9780, 200, array['중식']) w
   where w.name like '거리테스트%';
  if names is not null then
    raise exception '중식 필터에 한식이 걸려 나왔다: %', names;
  end if;
end
$$;

-- 거리 계산이 실제와 맞는지 (오차 5m 이내)
do $$
declare d double precision;
begin
  select w.distance_m into d
    from restaurants_within(37.5665, 126.9780, 200) w
   where w.name = '거리테스트150m';
  if abs(d - 150) > 5 then
    raise exception 'distance_m 이 150m 와 %m 나 차이난다', round(abs(d - 150)::numeric, 1);
  end if;
end
$$;

-- 인덱스를 타는지. 행이 적으면 플래너가 Seq Scan 을 고르므로 충분히 채운다.
insert into restaurants(name, category, location, created_by)
select
  '부하' || i,
  '기타',
  st_makepoint(126.5 + (i % 1000) * 0.001, 37.2 + (i / 1000) * 0.001)::geography,
  '11111111-1111-1111-1111-111111111111'
from generate_series(1, 5000) as i;
analyze restaurants;

do $$
declare line text; plan text := '';
begin
  for line in
    execute 'explain (analyze, costs off) select * from restaurants_within(37.5665, 126.9780, 200)'
  loop
    plan := plan || line || E'\n';
  end loop;

  if plan not like '%restaurants_location_idx%' then
    raise exception E'GiST 인덱스를 안 탄다 (Seq Scan). 실행 계획:\n%', plan;
  end if;
  raise notice 'restaurants_within 실행 계획에 restaurants_location_idx 사용 확인';
end
$$;

-- ── 6.5 restaurants_in_bounds RPC (화면에 보이는 영역) ────────────────
do $$
begin
  if to_regprocedure('restaurants_in_bounds(double precision, double precision, double precision, double precision, text[], integer)') is null then
    raise exception 'restaurants_in_bounds 함수가 없다';
  end if;
end
$$;

do $$
declare n int; ids text;
begin
  -- 사각형 안쪽만 나와야 한다. 반경 원과 달리 모서리까지 포함이다.
  select count(*) into n
    from restaurants_in_bounds(37.5660, 126.9770, 37.5670, 126.9790) w
   where w.name in ('김밥천국', '베이글로드');
  if n = 0 then
    raise exception '사각형 안의 맛집이 안 나온다';
  end if;

  -- 밖은 안 나온다.
  select count(*) into n
    from restaurants_in_bounds(37.9000, 127.9000, 37.9100, 127.9100) w;
  if n <> 0 then
    raise exception '사각형 밖인데 %건 나왔다', n;
  end if;

  -- 카테고리 필터
  select string_agg(w.category, ',') into ids
    from restaurants_in_bounds(37.5000, 126.9000, 37.6000, 127.1000, array['중식']) w;
  if ids is not null and ids <> repeat('중식', 1) and ids like '%한식%' then
    raise exception '카테고리 필터가 안 걸린다: %', ids;
  end if;

  -- limit 은 잘리되 평점 높은 쪽부터 남는다.
  select count(*) into n
    from restaurants_in_bounds(37.0000, 126.0000, 38.0000, 128.0000, null, 3) w;
  if n > 3 then
    raise exception 'p_limit 3 인데 %건 왔다', n;
  end if;
end
$$;

do $$
declare line text; plan text := '';
begin
  for line in
    execute 'explain (analyze, costs off) select * from restaurants_in_bounds(37.5660, 126.9770, 37.5670, 126.9790)'
  loop
    plan := plan || line || E'\n';
  end loop;

  -- `&&` + st_makeenvelope 라 GiST 를 타야 한다. st_within 으로 쓰면 못 탄다.
  if plan not like '%restaurants_location_idx%' then
    raise exception E'restaurants_in_bounds 가 GiST 인덱스를 안 탄다. 실행 계획:\n%', plan;
  end if;
  raise notice 'restaurants_in_bounds 실행 계획에 restaurants_location_idx 사용 확인';
end
$$;

-- ── 7. 익명 세션 뒷받침 (SPEC §2.4) ──────────────────────────────────
-- auth.users 에 행이 생기면 profiles 가 따라 생겨야 한다. 안 생기면
-- 첫 리뷰 작성이 FK 위반으로 실패하는데, 사용자에겐 이유가 안 보인다.
do $$
declare nick text; n int;
begin
  insert into auth.users(id, email)
    values ('33333333-3333-3333-3333-333333333333', null);

  select display_name into nick from profiles
   where id = '33333333-3333-3333-3333-333333333333';

  if nick is null then
    raise exception 'auth.users 삽입에 profiles 가 따라오지 않았다 (트리거 미동작)';
  end if;

  -- 형용사 + 명사 + 4자리 (§2.4). 숫자가 빠지면 닉네임이 금방 겹친다.
  if nick !~ '^[가-힣]+[0-9]{4}$' then
    raise exception '닉네임 형식이 형용사+명사+4자리가 아니다: %', nick;
  end if;

  -- 매번 같은 값이 나오면 랜덤이 아니다. 400만 조합에서 30개가 전부 같을 확률은 0 에 가깝다.
  select count(distinct public.random_display_name()) into n
    from generate_series(1, 30);
  if n < 25 then
    raise exception '닉네임이 충분히 흩어지지 않는다 (30개 중 %개만 서로 다름)', n;
  end if;

  raise notice 'profiles 자동 생성 확인 (예: %)', nick;
end
$$;

-- restaurant_stats 는 호출자 권한으로 돌아야 한다. 아니면 세션 없는 요청도
-- 평점·리뷰 수를 읽어 가고, 그건 §2.3 의 "세션 없으면 0건" 과 어긋난다.
do $$
declare n int;
begin
  -- reloptions 는 'on' 으로도 'true' 로도 저장될 수 있다. 문자열 비교 말고 boolean 으로 읽는다.
  if not coalesce((
    select o.option_value
      from pg_class c, pg_options_to_table(c.reloptions) o
     where c.relname = 'restaurant_stats' and o.option_name = 'security_invoker'
  ), 'off')::boolean then
    raise exception 'restaurant_stats 에 security_invoker 가 안 켜져 있다';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from restaurant_stats;
  reset role;

  if n <> 0 then
    raise exception '세션 없이 restaurant_stats 가 %건 읽혔다', n;
  end if;
  raise notice 'restaurant_stats security_invoker 확인 (세션 없이 0건)';
end
$$;


-- ── 8. pick_restaurant (SPEC §3.2) ───────────────────────────────────
-- 여기 픽스처는 앞 절들과 섞이면 안 된다. 전용 좌표(먼 바다)에 따로 심는다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into restaurants(id, name, category, location, price_range, created_by)
  values
    ('aaaa0001-0000-0000-0000-000000000001', '픽_고평점', '한식',
     st_makepoint(128.5, 35.5)::geography, 1, uid),
    ('aaaa0002-0000-0000-0000-000000000002', '픽_저평점', '중식',
     st_makepoint(128.5001, 35.5)::geography, 4, uid),
    ('aaaa0003-0000-0000-0000-000000000003', '픽_신규', '일식',
     st_makepoint(128.5002, 35.5)::geography, 2, uid);

  -- 고평점 5점 / 저평점 1점 / 신규는 리뷰 없음
  insert into reviews(restaurant_id, user_id, rating)
  values ('aaaa0001-0000-0000-0000-000000000001', uid, 5),
         ('aaaa0002-0000-0000-0000-000000000002', uid, 1);
end
$$;

-- 20회 호출: 결과가 분산되고, 평점 높은 곳이 더 자주 나온다 (WBS 4.1 DoD)
do $$
declare
  hit text; n_distinct int := 0;
  n_high int := 0; n_low int := 0; n_new int := 0; i int;
begin
  create temp table _pick_runs(name text) on commit drop;
  for i in 1..20 loop
    select p.name into hit
      from pick_restaurant(35.5, 128.5, 200, 'lunch') p;
    insert into _pick_runs values (hit);
  end loop;

  select count(distinct name) into n_distinct from _pick_runs;
  select count(*) into n_high from _pick_runs where name = '픽_고평점';
  select count(*) into n_low  from _pick_runs where name = '픽_저평점';
  select count(*) into n_new  from _pick_runs where name = '픽_신규';

  if n_distinct < 2 then
    raise exception '20회 호출에 %종만 나왔다 — 결정론적이다', n_distinct;
  end if;
  -- weight: 고평점 6^1.5≈14.7 / 신규 1 / 저평점 2^1.5≈2.83.
  -- 기대값은 고평점 ~79%. 20회에서 저평점보다 적게 나올 확률은 사실상 0 이다.
  if n_high <= n_low then
    raise exception '평점 가중이 안 걸린다 (고평점 %회 <= 저평점 %회)', n_high, n_low;
  end if;
  raise notice 'pick_restaurant 20회 — 고평점 %, 저평점 %, 신규 % (%종)',
    n_high, n_low, n_new, n_distinct;
end
$$;

-- 직전 결과 제외 (WBS 4.4 DoD: 연속 재추첨에 같은 곳이 다시 나오지 않는다)
do $$
declare got uuid;
begin
  select p.id into got
    from pick_restaurant(35.5, 128.5, 200, 'lunch', null, null, 7,
      array['aaaa0001-0000-0000-0000-000000000001',
            'aaaa0002-0000-0000-0000-000000000002']::uuid[]) p;
  if got is distinct from 'aaaa0003-0000-0000-0000-000000000003' then
    raise exception '제외 목록이 안 먹는다 (기대: 픽_신규, 실제: %)', got;
  end if;

  -- 전부 제외하면 빈 결과. 여기서 아무거나 돌려주면 [다시 뽑기] 가 같은 곳을 준다.
  select p.id into got
    from pick_restaurant(35.5, 128.5, 200, 'lunch', null, null, 7,
      array['aaaa0001-0000-0000-0000-000000000001',
            'aaaa0002-0000-0000-0000-000000000002',
            'aaaa0003-0000-0000-0000-000000000003']::uuid[]) p;
  if got is not null then
    raise exception '후보를 전부 제외했는데 %가 나왔다', got;
  end if;
end
$$;

-- 최근 간 곳 제외 → 후보 0건이면 그 조건만 풀고 재시도 (SPEC §3.2 4번)
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111'; got uuid; n int;
begin
  -- 세 곳 모두 "어제 다녀왔다" 로 기록
  insert into recommendation_logs(user_id, restaurant_id, meal_type, accepted, created_at)
  select uid, r.id, 'lunch', true, now() - interval '1 day'
    from restaurants r where r.name like '픽\_%';

  -- auth.uid() 가 있어야 제외가 걸린다
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', uid), true);

  -- 앞 절들도 recommendation_logs 를 쓴다. 이 절의 픽스처만 센다.
  select count(*) into n
    from recommendation_logs l join restaurants r on r.id = l.restaurant_id
   where l.user_id = uid and l.accepted and r.name like '픽\_%';
  if n <> 3 then raise exception '픽스처가 3건이 아니라 %건이다', n; end if;

  select p.id into got from pick_restaurant(35.5, 128.5, 200, 'lunch') p;
  if got is null then
    raise exception '전부 최근 방문이면 조건을 풀고라도 하나는 나와야 한다';
  end if;

  -- 반대로 카테고리를 없는 값으로 주면 폴백이 걸려도 0건이어야 한다.
  -- (폴백은 "최근 간 곳" 조건만 푼다. 사용자가 고른 조건까지 넓히지 않는다)
  select p.id into got
    from pick_restaurant(35.5, 128.5, 200, 'lunch', array['양식']) p;
  if got is not null then
    raise exception '카테고리 조건이 폴백에서 풀렸다 (%)', got;
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'pick_restaurant 폴백·제외 확인';
end
$$;

\echo '✓ 스키마 검증 통과'
