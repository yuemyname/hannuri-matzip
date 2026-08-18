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
  -- categories(2026-08-09) + feedback(2026-08-10) 이 늘어 8개다.
  if n <> 8 then
    raise exception '앱 테이블 8개를 기대했는데 %개다', n;
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

  -- spatial_ref_sys 도 잠겨 있어야 한다 (2026-08-18, Supabase 보안 경고).
  -- 우리 표가 아니라 PostGIS 표지만, public 에 있는 한 익명 키로 쓰기가 됐다.
  if not exists (select 1 from pg_tables
                  where schemaname = 'public' and tablename = 'spatial_ref_sys'
                    and rowsecurity) then
    raise exception 'spatial_ref_sys 에 RLS 가 꺼져 있다';
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

-- spatial_ref_sys: **읽기는 뚫려 있어야 한다** (2026-08-18). PostGIS 가
-- geography 계산 중에 이 표를 읽는데 RPC 는 invoker 라 이 롤로 읽는다.
-- 잠그다가 읽기까지 막으면 지도 조회가 통째로 터진다 — 그게 이 검사의 이유다.
set role anon;
insert into _rls values ('anon_srid', (select count(*) from spatial_ref_sys where srid = 4326));
reset role;

-- 쓰기는 막혀야 한다. Supabase 기본 권한이 public 새 표에 쓰기까지 얹어서,
-- 익명 키로 SRID 정의를 고칠 수 있었다 (Supabase 보안 경고의 실체).
set role anon;
do $$
begin
  begin
    update spatial_ref_sys set srtext = '뒤틀림' where srid = 4326;
    raise exception '익명 키로 spatial_ref_sys 가 수정됐다';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- 세션 있음 — 보여야 한다. DoD 후반부.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into _rls values ('auth_restaurants', (select count(*) from restaurants));
insert into _rls values ('auth_own_logs',    (select count(*) from recommendation_logs));
-- geography 조회의 끝-끝 확인 (2026-08-18). spatial_ref_sys 를 잠근 뒤에도
-- 반경 RPC 가 이 롤로 돌아야 한다 — 표 직접 읽기만 봐서는 모자란다.
insert into _rls values ('auth_within',
  (select count(*) from restaurants_within(37.5665, 126.9780, 200)));
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

  -- 잠근 뒤에도 SRID 4326 은 읽혀야 한다. 0이면 PostGIS 조회가 터질 상태다.
  select _rls.v into v from _rls where k = 'anon_srid';
  if v <> 1 then raise exception 'spatial_ref_sys 의 4326 이 안 읽힌다 (%건)', v; end if;

  select _rls.v into v from _rls where k = 'auth_restaurants';
  if v = 0 then raise exception '세션이 있는데 restaurants 가 0건이다'; end if;

  select _rls.v into v from _rls where k = 'auth_own_logs';
  if v <> 1 then raise exception '본인 추천 로그가 1건이 아니라 %건이다', v; end if;

  select _rls.v into v from _rls where k = 'auth_within';
  if v = 0 then raise exception 'spatial_ref_sys 를 잠근 뒤 반경 조회가 0건이다 — 읽기가 막혔을 수 있다'; end if;

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

-- ── 6.6 예약 (2026-08-09) ─────────────────────────────────────────────
-- 링크는 사람이 붙여넣는 값이라 그대로 anchor 의 href 가 된다. `javascript:` 가
-- 들어가면 클릭 한 번에 스크립트가 돈다 — 화면에서도 거르지만 마지막 방어선은 DB다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
  bad text;
begin
  foreach bad in array array[
    'javascript:alert(1)',
    'data:text/html,<script>a</script>',
    'ftp://example.com',
    'example.com',
    'http://예약 사이트'          -- 공백이 섞이면 뒤가 잘려 엉뚱한 데로 간다
  ]
  loop
    begin
      insert into restaurants(name, category, location, created_by, reservation_url)
        values ('예약_나쁨', '한식', st_makepoint(126.979, 37.567)::geography, uid, bad);
      raise exception '위험한 예약 링크 % 가 거부되지 않았다', quote_literal(bad);
    exception when check_violation then null;
    end;
  end loop;

  -- 정상 링크는 들어간다.
  insert into restaurants(id, name, category, location, created_by, reservable, reservation_url)
  values ('dddd0001-0000-0000-0000-000000000001', '예약_좋음', '한식',
          st_makepoint(126.9791, 37.5671)::geography, uid, true,
          'https://booking.naver.com/booking/13/bizes/1234');
end
$$;

-- 전화로만 받는 집: 예약은 되는데 링크가 없다. 둘을 묶어 두면 이게 못 들어간다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into restaurants(name, category, location, created_by, reservable)
  values ('예약_전화만', '한식', st_makepoint(126.9792, 37.5672)::geography, uid, true);
end
$$;

-- 지도 조회가 예약 여부를 함께 준다 (카드에 "예약 가능" 을 적으려면 필요하다).
do $$
declare n int;
begin
  select count(*) into n
    from restaurants_in_bounds(37.5660, 126.9770, 37.5690, 126.9800) w
   where w.name = '예약_좋음' and w.reservable;
  if n <> 1 then
    raise exception 'restaurants_in_bounds 가 reservable 을 안 준다 (%건)', n;
  end if;
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
  -- **셋을 같은 종류로 둔다** (2026-08-12). 뽑기가 종류부터 공평해져서, 종류가
  -- 다르면 세 곳이 각자 한 종류를 통째로 차지해 평점 가중치가 아예 안 보인다
  -- (실제로 이 픽스처가 한식·중식·일식이던 동안 아래 검사가 동전 던지기였다).
  -- 평점 순위는 **종류 안에서** 유지되는 것이므로 종류를 맞춰야 검사가 된다.
  insert into restaurants(id, name, category, location, price_range, created_by)
  values
    ('aaaa0001-0000-0000-0000-000000000001', '픽_고평점', '한식',
     st_makepoint(128.5, 35.5)::geography, 1, uid),
    ('aaaa0002-0000-0000-0000-000000000002', '픽_저평점', '한식',
     st_makepoint(128.5001, 35.5)::geography, 4, uid),
    ('aaaa0003-0000-0000-0000-000000000003', '픽_신규', '한식',
     st_makepoint(128.5002, 35.5)::geography, 2, uid);

  -- 고평점 5점 / 저평점 1점 / 신규는 리뷰 없음
  insert into reviews(restaurant_id, user_id, rating)
  values ('aaaa0001-0000-0000-0000-000000000001', uid, 5),
         ('aaaa0002-0000-0000-0000-000000000002', uid, 1);
end
$$;

-- 여러 번 호출: 결과가 분산되고, 평점 높은 곳이 더 자주 나온다 (WBS 4.1 DoD)
do $$
declare
  RUNS constant int := 300;   -- 무작위라 표본이 작으면 그날그날 다른 답이 나온다
  hit text; n_distinct int := 0;
  n_high int := 0; n_low int := 0; n_new int := 0; i int;
begin
  create temp table _pick_runs(name text) on commit drop;
  for i in 1..RUNS loop
    select p.name into hit
      from pick_restaurant(35.5, 128.5, 200, 'lunch') p;
    insert into _pick_runs values (hit);
  end loop;

  select count(distinct name) into n_distinct from _pick_runs;
  select count(*) into n_high from _pick_runs where name = '픽_고평점';
  select count(*) into n_low  from _pick_runs where name = '픽_저평점';
  select count(*) into n_new  from _pick_runs where name = '픽_신규';

  if n_distinct < 2 then
    raise exception '%회 호출에 %종만 나왔다 — 결정론적이다', RUNS, n_distinct;
  end if;

  -- 신뢰도 보정 후 weight = score^2, score = (avg*n + 3.5*3)/(n+3):
  --   고평점(5점 1개) 3.875^2 ≈ 15.0 / 신규(리뷰 없음) 3.5^2 = 12.25 / 저평점(1점 1개) 2.875^2 ≈ 8.3
  if n_high <= n_low then
    raise exception '평점 가중이 안 걸린다 (고평점 %회 <= 저평점 %회)', n_high, n_low;
  end if;

  -- **신규가 꼴찌가 아니다.** 예전 식(avg+1)^1.5 에서는 리뷰 없는 곳이 weight 1 로
  -- 1점짜리(2.83)보다도 불리했다 — 아무도 안 가 보면 영영 안 뽑히는 구조였다.
  -- 지금은 리뷰가 없으면 전체 평균(3.5)에서 시작하므로 1점짜리보다 자주 나온다.
  if n_new <= n_low then
    raise exception '리뷰 없는 곳이 1점짜리보다 안 나온다 (신규 %회 <= 저평점 %회)',
      n_new, n_low;
  end if;

  raise notice 'pick_restaurant %회 — 고평점 %, 저평점 %, 신규 % (%종)',
    RUNS, n_high, n_low, n_new, n_distinct;
end
$$;

-- ── 8b. 상황 태그 + 시간대 가중치 (2026-08-09) ────────────────────────
-- "저녁엔 가벼운 것과 회식 위주" 를 태그로 판단한다. 두 곳을 같은 자리·같은
-- 조건(리뷰 없음)으로 두고 태그만 다르게 해서, 시간대에 따라 뒤집히는지 본다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into restaurants(id, name, category, location, created_by, mood_tags)
  values
    ('bbbb0001-0000-0000-0000-000000000001', '무드_회식', '한식',
     st_makepoint(128.6, 35.6)::geography, uid, array['회식']),
    ('bbbb0002-0000-0000-0000-000000000002', '무드_혼밥', '한식',
     st_makepoint(128.6, 35.6)::geography, uid, array['혼밥']);
end
$$;

-- 어휘 밖의 값은 안 들어간다. "회식"·"회식용"·"단체" 가 섞이면 가중치가 안 걸린다.
do $$
begin
  begin
    update restaurants set mood_tags = array['단체']
     where id = 'bbbb0001-0000-0000-0000-000000000001';
    raise exception '어휘 밖의 mood_tag(''단체'')가 거부되지 않았다';
  exception when check_violation then null;
  end;
end
$$;

do $$
declare
  RUNS constant int := 300;
  i int; hit text;
  d_group int := 0; d_solo int := 0;
  l_group int := 0; l_solo int := 0;
begin
  for i in 1..RUNS loop
    select p.name into hit from pick_restaurant(35.6, 128.6, 200, 'dinner') p;
    if hit = '무드_회식' then d_group := d_group + 1;
    elsif hit = '무드_혼밥' then d_solo := d_solo + 1; end if;

    select p.name into hit from pick_restaurant(35.6, 128.6, 200, 'lunch') p;
    if hit = '무드_회식' then l_group := l_group + 1;
    elsif hit = '무드_혼밥' then l_solo := l_solo + 1; end if;
  end loop;

  -- 저녁: 회식 1.6 / 혼밥 0.8 → 기대 2:1. 300회에서 뒤집힐 일은 사실상 없다.
  if d_group <= d_solo then
    raise exception '저녁에 회식집이 더 안 나온다 (회식 %회 <= 혼밥 %회)', d_group, d_solo;
  end if;
  -- 점심: 혼밥 1.5 / 회식 0.5 → 기대 3:1
  if l_solo <= l_group then
    raise exception '점심에 혼밥집이 더 안 나온다 (혼밥 %회 <= 회식 %회)', l_solo, l_group;
  end if;
  raise notice '시간대 가중치 — 저녁 회식 %/혼밥 %, 점심 혼밥 %/회식 %',
    d_group, d_solo, l_solo, l_group;
end
$$;

-- 뽑힌 결과가 태그를 함께 준다. 화면이 "왜 이걸 골랐는지" 를 보여주려면 필요하다.
do $$
declare tags text[];
begin
  select p.mood_tags into tags from pick_restaurant(35.6, 128.6, 200, 'dinner') p;
  if tags is null or array_length(tags, 1) is null then
    raise exception 'pick_restaurant 가 mood_tags 를 안 준다';
  end if;
end
$$;

-- 가까운 쪽이 조금 유리하다. 반경 안이면 5m 든 195m 든 똑같던 것을 고쳤다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
  RUNS constant int := 300;
  i int; hit text; n_near int := 0; n_far int := 0;
begin
  insert into restaurants(id, name, category, location, created_by)
  values
    ('cccc0001-0000-0000-0000-000000000001', '거리_가까움', '한식',
     st_makepoint(128.7, 35.7)::geography, uid),
    ('cccc0002-0000-0000-0000-000000000002', '거리_멂', '한식',
     st_makepoint(128.7021, 35.7)::geography, uid);   -- 약 190m

  for i in 1..RUNS loop
    select p.name into hit from pick_restaurant(35.7, 128.7, 200, 'lunch') p;
    if hit = '거리_가까움' then n_near := n_near + 1;
    elsif hit = '거리_멂' then n_far := n_far + 1; end if;
  end loop;

  -- 점심은 1.45 배까지 준다. 기대 약 1.42:1 이라 300회면 안전하다.
  if n_near <= n_far then
    raise exception '가까운 쪽이 유리하지 않다 (가까움 %회 <= 멂 %회)', n_near, n_far;
  end if;
  raise notice '거리 가중치 — 가까움 %, 멂 %', n_near, n_far;
end
$$;

-- ── 8c. 태그가 없어도 점심·저녁이 갈린다 (2026-08-09) ─────────────────
-- 8b 는 시간대를 `mood_tags` 하나에만 걸었다. 그래서 아무도 태그를 안 달면 점심과
-- 저녁이 똑같았다 — 지금 등록된 곳들이 정확히 그 상태다. 가격대를 기본 축으로 뒀고,
-- **그게 태그 없이도 뒤집히는지**를 본다. 두 곳을 같은 자리·리뷰 없음·태그 없음으로
-- 두고 가격대만 다르게 한다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into restaurants(id, name, category, location, created_by, price_range)
  values
    ('eeee0001-0000-0000-0000-000000000001', '가격_싼집', '한식',
     st_makepoint(128.8, 35.8)::geography, uid, 1),
    ('eeee0002-0000-0000-0000-000000000002', '가격_비싼집', '한식',
     st_makepoint(128.8, 35.8)::geography, uid, 4);
end
$$;

--
-- **"더 많이 나왔다" 로는 검사가 안 된다.** 후보가 둘뿐이라 가중치를 통째로 없애도
-- 5할씩 나오고, 그러면 방향 비교는 동전 던지기가 되어 절반은 그냥 통과한다
-- (실제로 price_fit 을 1.0 으로 만들어 보고 통과하는 걸 확인했다). 그래서
-- **몫에 하한을 둔다** — 기대 61%, 통과선 55%. 망가지면 50% 로 내려앉아 걸린다.
do $$
declare
  RUNS constant int := 1000;
  FLOOR_HITS constant int := RUNS * 55 / 100;
  i int; hit text;
  d_cheap int := 0; d_pricey int := 0;
  l_cheap int := 0; l_pricey int := 0;
  tags text[];
begin
  -- 전제 확인. 태그가 하나라도 붙어 있으면 이 아래 결과는 가격 이야기가 아니다.
  select r.mood_tags into tags from restaurants r
   where r.id = 'eeee0001-0000-0000-0000-000000000001';
  if coalesce(array_length(tags, 1), 0) <> 0 then
    raise exception '가격 검증인데 태그가 붙어 있다: %', tags;
  end if;

  for i in 1..RUNS loop
    select p.name into hit from pick_restaurant(35.8, 128.8, 200, 'dinner') p;
    if hit = '가격_싼집' then d_cheap := d_cheap + 1;
    elsif hit = '가격_비싼집' then d_pricey := d_pricey + 1; end if;

    select p.name into hit from pick_restaurant(35.8, 128.8, 200, 'lunch') p;
    if hit = '가격_싼집' then l_cheap := l_cheap + 1;
    elsif hit = '가격_비싼집' then l_pricey := l_pricey + 1; end if;
  end loop;

  -- 1.225 대 0.775 → 기대 61.2%. 1000회에서 55% 아래로 떨어지려면 4σ 어긋나야 한다.
  if d_pricey < FLOOR_HITS then
    raise exception '저녁에 비싼 쪽이 충분히 안 나온다 (비쌈 %회 < %회, 쌈 %회)',
      d_pricey, FLOOR_HITS, d_cheap;
  end if;
  if l_cheap < FLOOR_HITS then
    raise exception '점심에 싼 쪽이 충분히 안 나온다 (쌈 %회 < %회, 비쌈 %회)',
      l_cheap, FLOOR_HITS, l_pricey;
  end if;
  raise notice '태그 없는 가격 축 — 저녁 비쌈 %/쌈 %, 점심 쌈 %/비쌈 % (통과선 %)',
    d_pricey, d_cheap, l_cheap, l_pricey, FLOOR_HITS;
end
$$;

-- 가격대는 선택 입력이라 비어 있는 곳이 흔하다. **null 이면 어느 쪽으로도 안 기울어야
-- 한다** — 여기서 0 이 되거나 에러가 나면, 가격을 안 적은 집이 통째로 안 뽑힌다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
  RUNS constant int := 60; i int; hit text; n int := 0;
begin
  insert into restaurants(id, name, category, location, created_by)
  values ('eeee0003-0000-0000-0000-000000000003', '가격_없음', '한식',
          st_makepoint(128.9, 35.9)::geography, uid);
  for i in 1..RUNS loop
    select p.name into hit from pick_restaurant(35.9, 128.9, 200, 'dinner') p;
    if hit = '가격_없음' then n := n + 1; end if;
  end loop;
  if n <> RUNS then
    raise exception '가격대 없는 곳이 안 뽑힌다 (%회/%회)', n, RUNS;
  end if;
end
$$;

-- 거리의 무게도 시간대마다 다르다. 점심은 한 시간 안에 다녀와야 해서 100m 가 진짜
-- 차이고, 저녁은 시간이 있으니 거의 안 본다 (점심 0.45 / 저녁 0.1).
--
-- **이건 앞의 검사들보다 표본이 커야 한다.** 두 비율의 차이(약 59% 대 52%)를 보는
-- 것이라, 한쪽만 보는 검사보다 흔들림이 크다. 300회로는 우연히 뒤집힌다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
  RUNS constant int := 2000;
  LUNCH_FLOOR constant int := RUNS * 55 / 100;
  DINNER_CEIL constant int := RUNS * 56 / 100;
  i int; hit text; l_near int := 0; d_near int := 0;
begin
  insert into restaurants(id, name, category, location, created_by)
  values
    ('eeee0004-0000-0000-0000-000000000004', '시간대거리_가까움', '한식',
     st_makepoint(129.0, 36.0)::geography, uid),
    ('eeee0005-0000-0000-0000-000000000005', '시간대거리_멂', '한식',
     st_makepoint(129.0021, 36.0)::geography, uid);   -- 약 190m

  for i in 1..RUNS loop
    select p.name into hit from pick_restaurant(36.0, 129.0, 200, 'lunch') p;
    if hit = '시간대거리_가까움' then l_near := l_near + 1; end if;
    select p.name into hit from pick_restaurant(36.0, 129.0, 200, 'dinner') p;
    if hit = '시간대거리_가까움' then d_near := d_near + 1; end if;
  end loop;

  -- 가격 검사와 같은 이유로 **두 값을 서로 비교하지 않는다.** 무게를 같게 만들면
  -- 둘이 붙어서 대소 비교가 동전 던지기가 된다. 각자 선을 넘는지로 본다:
  -- 점심 기대 59.2% (55% 위여야), 저녁 기대 52.4% (56% 아래여야).
  -- 상한을 57% 로 뒀다가 낮췄다 — 무게를 같게 만든 코드가 1150 으로 아슬아슬하게만
  -- 걸렸다. 56% 면 망가진 쪽이 통과할 확률이 0.2% 로 떨어진다.
  if l_near < LUNCH_FLOOR then
    raise exception '점심에 가까운 쪽을 충분히 안 챙긴다 (%회 < %회 / %회)',
      l_near, LUNCH_FLOOR, RUNS;
  end if;
  if d_near > DINNER_CEIL then
    raise exception '저녁에 거리를 점심만큼 본다 (%회 > %회 / %회)',
      d_near, DINNER_CEIL, RUNS;
  end if;
  raise notice '시간대별 거리 무게 — 점심 가까움 %/% (하한 %), 저녁 가까움 %/% (상한 %)',
    l_near, RUNS, LUNCH_FLOOR, d_near, RUNS, DINNER_CEIL;
end
$$;

-- ── 8d. 종류부터 공평하다 (2026-08-12 요청: "한식이 너무 많이 나와") ──
--
-- 곳 단위로만 뽑으면 등록이 많은 종류가 그만큼 자주 나온다. 화면의 룰렛은 칸을
-- 똑같은 크기로 그려서 "종류는 공평하다" 고 약속하는 것처럼 읽히므로, 실제도
-- 그렇게 맞췄다: **후보에 남은 종류를 먼저 고르고, 그 안에서 곳을 고른다.**
--
-- 한식 셋 대 카페 하나를 같은 자리에 두고 본다. 예전 식이면 카페가 25%,
-- 지금은 50% 여야 한다.
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into restaurants(id, name, category, location, created_by)
  values
    ('ffff0001-0000-0000-0000-000000000001', '공평_한식1', '한식',
     st_makepoint(129.1, 36.1)::geography, uid),
    ('ffff0002-0000-0000-0000-000000000002', '공평_한식2', '한식',
     st_makepoint(129.1, 36.1)::geography, uid),
    ('ffff0003-0000-0000-0000-000000000003', '공평_한식3', '한식',
     st_makepoint(129.1, 36.1)::geography, uid),
    ('ffff0004-0000-0000-0000-000000000004', '공평_카페1', '카페',
     st_makepoint(129.1, 36.1)::geography, uid);

  -- 하나에만 별 5개를 달아 **한식 셋의 무게를 서로 다르게** 만든다. 종류 합을
  -- 제대로 나누는지 보려면 안이 고르지 않아야 한다 — 셋이 똑같으면 개수로만
  -- 나눠도 우연히 맞는다.
  insert into reviews(restaurant_id, user_id, rating)
  values ('ffff0001-0000-0000-0000-000000000001', uid, 5);
end
$$;

do $$
declare
  RUNS constant int := 1000;
  -- 기대 50%. 표준편차 1.6%p 라 4σ 를 잡아 44~56% 로 둔다. 예전 식(25%)은
  -- 하한에서 12σ 밖이라 절대 못 지나가고, "카페만 나온다" 는 상한이 잡는다.
  LO constant int := RUNS * 44 / 100;
  HI constant int := RUNS * 56 / 100;
  i int; hit text; n_cafe int := 0; n_han int := 0; n_seen int;
begin
  create temp table _fair_runs(name text) on commit drop;
  for i in 1..RUNS loop
    select p.name into hit from pick_restaurant(36.1, 129.1, 200, 'lunch') p;
    insert into _fair_runs values (hit);
    if hit = '공평_카페1' then n_cafe := n_cafe + 1;
    else n_han := n_han + 1; end if;
  end loop;

  if n_cafe < LO or n_cafe > HI then
    raise exception '종류가 공평하지 않다 (카페 %회, 한식 %회 / 통과 %~%)',
      n_cafe, n_han, LO, HI;
  end if;

  -- **한식 셋이 다 나와야 한다.** 종류 안에서 한 곳만 뽑히면 "종류는 공평한데
  -- 그 안은 고정" 이 되는데, 그건 위 비율만으로는 안 걸린다.
  select count(distinct name) into n_seen from _fair_runs where name <> '공평_카페1';
  if n_seen <> 3 then
    raise exception '한식 셋 중 %곳만 나왔다 — 종류 안에서 안 흩어진다', n_seen;
  end if;

  raise notice '종류 공평 — 카페 %/%, 한식 % (%곳)', n_cafe, RUNS, n_han, n_seen;
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


-- ── 9. 피드백 (2026-08-10, SPEC §4.7) ────────────────────────────────
-- 빈 글·장문은 못 들어간다. 화면의 검사와 같은 뜻이어야 한다 —
-- 갈라지면 화면은 통과시키는데 저장이 실패한다.
do $$
begin
  begin
    insert into feedback(body) values ('   ');
    raise exception '공백뿐인 피드백이 거부되지 않았다';
  exception when check_violation then null;
  end;

  begin
    insert into feedback(body) values (repeat('가', 1001));
    raise exception '1001자 피드백이 거부되지 않았다';
  exception when check_violation then null;
  end;

  -- 딱 1000자는 통과해야 한다. 경계에서 한 칸 어긋나면 화면과 갈라진다.
  insert into feedback(body) values (repeat('나', 1000));
  insert into feedback(body) values ('마커가 겹쳐서 안 눌려요');
end
$$;

-- **누가 썼는지 남기지 않는다** (SPEC §4.7). user_id 열이 생기면 익명이 아니게 된다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'feedback'
       and column_name in ('user_id', 'created_by')
  ) then
    raise exception 'feedback 에 작성자 열이 생겼다 — 익명이 아니게 된다';
  end if;
end
$$;

-- **쓰기만 열려 있고 읽기는 닫혀 있다.** select 정책이 생기면 남의 피드백을
-- anon 키로 읽을 수 있게 된다. 읽는 길은 service_role 라우트 하나뿐이어야 한다.
do $$
declare cmds text;
begin
  select string_agg(distinct cmd, ',' order by cmd) into cmds
    from pg_policies where schemaname = 'public' and tablename = 'feedback';
  if cmds is distinct from 'INSERT' then
    raise exception 'feedback 정책이 INSERT 하나가 아니다: %', coalesce(cmds, '(없음)');
  end if;

  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'feedback' and rowsecurity
  ) then
    raise exception 'feedback 에 RLS 가 꺼져 있다';
  end if;
end
$$;

-- 실제로 못 읽는지 롤을 바꿔 확인한다. 정책 목록만 보고 넘기면,
-- 나중에 누가 select 를 열어도 위 검사만 고쳐 놓고 지나갈 수 있다.
do $$
declare n int;
begin
  set local role authenticated;
  begin
    select count(*) into n from feedback;
  exception when others then
    n := -1;   -- 못 읽으면 그것도 정답이다
  end;
  reset role;
  if n <> 0 and n <> -1 then
    raise exception 'authenticated 롤이 피드백 %건을 읽었다', n;
  end if;
end
$$;

-- 관리자 화면이 "안 본 것 먼저, 그다음 최근 순" 으로 읽는다.
do $$
declare first_body text;
begin
  update feedback set resolved = true where body = '마커가 겹쳐서 안 눌려요';
  insert into feedback(body) values ('최근에 들어온 안 본 것');

  select f.body into first_body from feedback f
   order by f.resolved asc, f.created_at desc limit 1;
  if first_body <> '최근에 들어온 안 본 것' then
    raise exception '안 본 피드백이 맨 위가 아니다: %', first_body;
  end if;
end
$$;

-- 배너는 언제나 이 파일의 **마지막 줄**이다. 뒤에 검사를 붙이면
-- 그 검사가 실패해도 화면에는 통과가 찍힌다 (2026-08-10 에 실제로 그랬다).
\echo '✓ 스키마 검증 통과'
