-- 예약 가능 여부 + 예약 링크 (2026-08-09 요청).
--
-- 네이버 예약 API 로 빈자리를 가져오는 건 제휴·심사가 필요해서 사내 툴 범위를
-- 벗어난다. 대신 **사람이 적어 두는 두 값**만 둔다 — "예약 되나요" 와 "어디서요".
-- 지금까지는 이걸 memo 에 문장으로 적고 있었는데, 문장은 화면이 버튼으로 못 바꾼다.

alter table restaurants
  add column if not exists reservable boolean not null default false,
  add column if not exists reservation_url text;

-- 링크는 http(s) 만. 사람이 붙여넣는 값이라 `javascript:` 같은 게 들어오면
-- 그대로 anchor 의 href 가 되어 클릭 한 번에 스크립트가 돈다.
-- **화면에서도 한 번 더 거르지만, 마지막 방어선은 여기다** — 관리자 화면·등록 폼
-- 두 경로가 있고 둘 중 하나만 놓쳐도 뚫린다.
alter table restaurants drop constraint if exists restaurants_reservation_url_scheme;
alter table restaurants add constraint restaurants_reservation_url_scheme check (
  reservation_url is null or reservation_url ~ '^https?://[^[:space:]]+$'
);

-- 링크만 있고 "예약 안 됨" 이거나, "예약 됨" 인데 링크가 없는 건 둘 다 말이 된다
-- (전화 예약만 받는 집이 있다). 그래서 두 값을 서로 묶지 않는다.

-- ── restaurants_in_bounds 에 예약 여부를 실어 준다 ─────────────────────
-- 지도 카드에서 "예약 가능" 을 보여주려면 필요하다. 링크까지는 안 보낸다 —
-- 카드에서 바로 예약으로 뛰는 동선은 없고, 목록마다 URL 을 나르면 응답만 커진다.
drop function if exists restaurants_in_bounds(
  double precision, double precision, double precision, double precision, text[], integer
);

create function restaurants_in_bounds(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_categories text[] default null,
  p_limit integer default 200
)
returns table (
  id uuid, name text, category text, road_address text,
  lat double precision, lng double precision,
  price_range smallint, memo text,
  avg_rating numeric, review_count bigint,
  reservable boolean
)
language sql stable as $$
  select r.id, r.name, r.category, r.road_address,
         st_y(r.location::geometry), st_x(r.location::geometry),
         r.price_range, r.memo,
         s.avg_rating, s.review_count,
         r.reservable
  from restaurants r
  join restaurant_stats s on s.restaurant_id = r.id
  where r.is_active
    and r.location && st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    and (p_categories is null or r.category = any(p_categories))
  order by s.avg_rating desc, r.name
  limit greatest(p_limit, 1);
$$;
