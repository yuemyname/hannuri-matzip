-- 반경 조회 RPC — SPEC.md §3.1
--
-- st_dwithin(geography) + GiST 인덱스라 인덱스를 탄다.
-- st_distance(...) < radius 로 쓰면 인덱스를 못 타고 풀스캔이 된다 (CLAUDE.md).
-- security definer 가 아니므로 RLS 가 호출자 기준으로 그대로 걸린다 —
-- 세션 없이 anon 키만 있으면 0건이다 (§2.3).

create or replace function restaurants_within(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 200,
  p_categories text[] default null,
  p_min_rating numeric default null
)
returns table (
  id uuid, name text, category text, road_address text,
  lat double precision, lng double precision,
  price_range smallint, memo text,
  distance_m double precision,
  avg_rating numeric, review_count bigint
)
language sql stable as $$
  select r.id, r.name, r.category, r.road_address,
         st_y(r.location::geometry), st_x(r.location::geometry),
         r.price_range, r.memo,
         st_distance(r.location, st_makepoint(p_lng, p_lat)::geography) as distance_m,
         s.avg_rating, s.review_count
  from restaurants r
  join restaurant_stats s on s.restaurant_id = r.id
  where r.is_active
    and st_dwithin(r.location, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
    and (p_categories is null or r.category = any(p_categories))
    and (p_min_rating is null or s.avg_rating >= p_min_rating)
  order by distance_m;
$$;
