-- 화면에 보이는 영역 조회 RPC.
--
-- 반경(`restaurants_within`) 대신 지도 뷰포트를 그대로 받는다. "빨간 원 안"이
-- 아니라 "지금 보이는 데까지" 가 곳 규칙이 됐다 — 줄을 당겨 넓히면 더 보이고
-- 좁히면 덜 보인다. 반경 토글과 원은 화면에서 없앴다.
--
-- `restaurants_within` 은 지우지 않는다. 점메추(`pick_restaurant`)가 여전히
-- "내 위치에서 N m" 로 후보를 고르기 때문이다 — 거긴 보이는 영역과 무관하다.
--
-- security definer 가 아니라 RLS 가 호출자 기준으로 걸린다 (SPEC §2.3).

create or replace function restaurants_in_bounds(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_categories text[] default null,
  -- 줌을 한참 빼면 서울 전체가 들어온다. 화면에 찍을 수 있는 양을 넘으면
  -- 마커가 뭉개지기만 하므로 잘라서 보낸다. 잘렸는지는 호출부가 개수로 안다.
  p_limit integer default 200
)
returns table (
  id uuid, name text, category text, road_address text,
  lat double precision, lng double precision,
  price_range smallint, memo text,
  avg_rating numeric, review_count bigint
)
language sql stable as $$
  select r.id, r.name, r.category, r.road_address,
         st_y(r.location::geometry), st_x(r.location::geometry),
         r.price_range, r.memo,
         s.avg_rating, s.review_count
  from restaurants r
  join restaurant_stats s on s.restaurant_id = r.id
  where r.is_active
    -- `&&` 는 GiST 인덱스를 타는 바운딩박스 겹침 연산자다. st_within 으로 쓰면
    -- 점 하나마다 정밀 판정을 하게 되는데, 사각형 안의 점을 찾는 데는 필요 없다.
    and r.location && st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    and (p_categories is null or r.category = any(p_categories))
  -- 잘릴 때 아무거나 남기지 않는다. 평점 높은 쪽부터 남겨야 잘려도 쓸 만하다.
  order by s.avg_rating desc, r.name
  limit greatest(p_limit, 1);
$$;

-- 거리(`distance_m`)를 안 준다. 화면에 적히는 거리는 **내 위치 기준**이라
-- 클라이언트가 다시 재고 있고, 여기서 주는 값은 뷰포트 기준이라 쓸 데가 없다.
