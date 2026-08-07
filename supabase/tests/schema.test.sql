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

-- ── 4. RLS ───────────────────────────────────────────────────────────
-- 0.3 에서 정책을 넣은 뒤 여기에 검사를 추가한다.
-- shim 이 anon/authenticated 롤과 auth.uid()/auth.role() 을 이미 만들어두므로,
--   set role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', false);
-- 형태로 실제 정책 동작을 확인할 수 있다.
do $$
declare n int;
begin
  select count(*) into n
    from pg_tables
   where schemaname = 'public' and rowsecurity
     and tablename in ('profiles','restaurants','menus','reviews',
                       'review_photos','recommendation_logs');
  raise notice 'RLS 켜진 앱 테이블: %개 (0.3 완료 시 6개가 되어야 한다)', n;
end
$$;

\echo '✓ 스키마 검증 통과'
