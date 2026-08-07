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
  if n <> 6 then
    raise exception '앱 테이블 6개를 기대했는데 %개다', n;
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
                      'reco_logs_user_created_idx']) as want
   where not exists (
     select 1 from pg_indexes where schemaname = 'public' and indexname = want
   );
  if missing is not null then
    raise exception '인덱스가 없다: %', missing;
  end if;
end
$$;

-- ── 픽스처 ───────────────────────────────────────────────────────────
insert into auth.users(id, email)
  values ('11111111-1111-1111-1111-111111111111', null);
insert into profiles(id, display_name)
  values ('11111111-1111-1111-1111-111111111111', '검증용');
insert into restaurants(name, category, location, price_range, created_by)
  values ('김밥천국', '분식', st_makepoint(126.9780, 37.5665)::geography, 1,
          '11111111-1111-1111-1111-111111111111');

-- ── 2. 제약 ──────────────────────────────────────────────────────────
-- category: 목록 밖의 값과 공백 섞인 오타가 조용히 들어가면 안 된다.
-- 들어가는 순간 SPEC §3.1 의 category = any(...) 매칭이 실패해
-- 그 맛집이 필터·점메추에서 에러 없이 사라진다.
do $$
begin
  begin
    insert into restaurants(name, category, location, created_by)
      values ('오타집', '한식 ', st_makepoint(126.979, 37.567)::geography,
              '11111111-1111-1111-1111-111111111111');
    raise exception 'category 뒤 공백(''한식 '')이 거부되지 않았다';
  exception when check_violation then null;
  end;

  begin
    insert into restaurants(name, category, location, created_by)
      values ('커피집', '커피', st_makepoint(126.979, 37.567)::geography,
              '11111111-1111-1111-1111-111111111111');
    raise exception '목록에 없는 category(''커피'')가 거부되지 않았다';
  exception when check_violation then null;
  end;
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
insert into profiles(id, display_name)
  values ('22222222-2222-2222-2222-222222222222', '검증용2');
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

\echo '✓ 스키마 검증 통과'
