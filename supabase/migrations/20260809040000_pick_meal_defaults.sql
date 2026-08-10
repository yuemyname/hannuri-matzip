-- 태그가 없어도 점심·저녁이 갈리게 (2026-08-09 요청).
--
-- 앞 마이그레이션(20260809020000)이 시간대를 `mood_tags` 하나에만 걸었다. 그래서
-- **태그를 아무도 안 달면 점심과 저녁이 여전히 똑같다.** 지금 등록된 곳들이 정확히
-- 그 상태고, 사람이 전부 태그를 달아 주기를 기다리는 건 계획이 아니다.
--
-- 그래서 **모든 맛집이 이미 가지고 있는 두 값**으로 기본 기울기를 만든다.
--
--   1) 가격대 — 점심은 싼 쪽, 저녁은 비싼 쪽.
--   2) 거리   — 점심은 가까울수록 크게 유리, 저녁은 거의 상관없음.
--
-- **카테고리는 안 쓴다.** "카페는 점심" 같은 규칙을 넣으려면 코드에 종류 목록을
-- 다시 적어야 하는데, 종류는 DB 표에서 얼마든지 늘어난다 (CLAUDE.md). 새로 만든
-- 종류는 아무 가중치도 못 받는 죽은 값이 되고, 그건 규칙이 아니라 함정이다.
-- 가격대와 거리는 그런 문제가 없다 — 뜻이 고정된 숫자다.
--
-- 태그는 그대로 남는다. 사람이 단 태그가 있으면 그게 더 세게 먹는다 (최대 2.7배 대
-- 1.58배). 추측보다 사람이 적어 둔 게 우선이라는 순서를 숫자로 박은 것이다.

create or replace function pick_restaurant(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 200,
  p_meal_type text default 'lunch',
  p_categories text[] default null,
  p_max_price smallint default null,
  p_exclude_days integer default 7,
  p_exclude_ids uuid[] default null
)
returns table (
  id uuid, name text, category text, road_address text,
  lat double precision, lng double precision,
  price_range smallint, memo text,
  distance_m double precision,
  avg_rating numeric, review_count bigint,
  mood_tags text[]
)
language plpgsql
volatile                       -- random() 을 쓴다. stable 이면 플래너가 한 번만 부른다.
as $$
begin
  if p_meal_type not in ('lunch','dinner') then
    raise exception 'meal_type 은 lunch 또는 dinner 여야 한다: %', p_meal_type;
  end if;

  return query
  with base as (
    select w.*, r.mood_tags
      from restaurants_within(p_lat, p_lng, p_radius_m, p_categories) w
      join restaurants r on r.id = w.id
     where (p_max_price is null or w.price_range is null or w.price_range <= p_max_price)
       and (p_exclude_ids is null or w.id <> all(p_exclude_ids))
  ),
  fresh as (
    select b.* from base b
     where not exists (
       select 1 from recommendation_logs l
        where l.user_id = auth.uid()
          and l.restaurant_id = b.id
          and l.accepted is true
          and l.created_at > now() - make_interval(days => p_exclude_days)
     )
  ),
  pool as (
    select * from fresh
    union all
    select * from base where not exists (select 1 from fresh)
  ),
  scored as (
    select p.*,
      -- 1) **평점 신뢰도 보정.** 리뷰 1개짜리 별 5개가 리뷰 20개 4.5 를 이기면 안 된다.
      --    전체 평균(3.5) 쪽으로 끌어당기되, 리뷰가 쌓일수록 제 점수에 가까워진다.
      --    리뷰가 없으면 정확히 3.5 — 신규가 꼴찌가 아니라 '평범' 에서 시작한다.
      ((p.avg_rating * p.review_count) + 3.5 * 3) / (p.review_count + 3) as score,
      -- 2) **시간대별 상황 가중치.** 사람이 단 태그가 있으면 이게 가장 세다.
      --    점심엔 혼자 빨리, 저녁엔 같이 오래.
      case p_meal_type
        when 'dinner' then
              (case when '회식'   = any(p.mood_tags) then 1.6 else 1.0 end)
            * (case when '가벼움' = any(p.mood_tags) then 1.4 else 1.0 end)
            * (case when '술'     = any(p.mood_tags) then 1.2 else 1.0 end)
            * (case when '혼밥'   = any(p.mood_tags) then 0.8 else 1.0 end)
        else
              (case when '혼밥'   = any(p.mood_tags) then 1.5 else 1.0 end)
            * (case when '가벼움' = any(p.mood_tags) then 1.2 else 1.0 end)
            * (case when '회식'   = any(p.mood_tags) then 0.5 else 1.0 end)
            * (case when '술'     = any(p.mood_tags) then 0.4 else 1.0 end)
      end as mood,
      -- 3) **가격대 — 태그가 없어도 시간대를 가르는 축.**
      --    2.5 를 기준으로 대칭이라, 점심에 유리한 만큼 저녁에 불리하다.
      --    점심 ~8천 1.225 … 2만+ 0.775 / 저녁은 정반대. 양 끝 차이 약 1.58배 —
      --    태그(최대 2.7배)보다 확실히 약하게 뒀다. 추측이 사람의 기록을 이기면 안 된다.
      --    **가격대는 선택 입력이라 null 이 흔하다.** 그때는 1.0, 어느 쪽으로도 안 기운다.
      case
        when p.price_range is null then 1.0
        when p_meal_type = 'dinner' then 1.0 + 0.15 * (p.price_range - 2.5)
        else                             1.0 - 0.15 * (p.price_range - 2.5)
      end as price_fit,
      -- 4) **거리 — 시간대마다 무게가 다르다.**
      --    점심은 한 시간 안에 다녀와야 해서 100m 가 진짜 차이다. 저녁은 시간이
      --    있으니 거의 안 본다. 예전엔 둘 다 0.3 이었다.
      1.0
        + (case p_meal_type when 'dinner' then 0.1 else 0.45 end)
        * (1.0 - least(p.distance_m / greatest(p_radius_m, 1), 1.0)) as near
    from pool p
  )
  -- 가중 랜덤. -ln(random())/weight 가 표준 트릭이다.
  select s.id, s.name, s.category, s.road_address, s.lat, s.lng,
         s.price_range, s.memo, s.distance_m, s.avg_rating, s.review_count, s.mood_tags
    from scored s
   order by -ln(random()) / (power(s.score, 2.0) * s.mood * s.price_fit * s.near)
   limit 1;
end;
$$;
