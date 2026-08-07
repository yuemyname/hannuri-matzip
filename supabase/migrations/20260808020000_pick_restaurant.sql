-- 랜덤 추천 RPC — SPEC.md §3.2 / WBS 4.1
--
-- **결정론 금지.** 뽑는 건 서버다. 클라이언트 룰렛은 연출일 뿐이고,
-- 최종 결과는 이 함수의 응답으로 고정된다.
--
-- security definer 가 아니다. 후보는 restaurants_within 을 그대로 쓰므로
-- RLS 가 호출자 기준으로 걸린다 — 세션이 없으면 후보가 0건이다.

create or replace function pick_restaurant(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 200,
  p_meal_type text default 'lunch',
  p_categories text[] default null,
  p_max_price smallint default null,
  p_exclude_days integer default 7,
  -- 세션 안에서 [다시 뽑기] 를 눌렀을 때 직전 결과를 빼는 데 쓴다 (WBS 4.4).
  -- SPEC §3.2 에는 없지만 4.4 의 DoD("연속 5회 재추첨 시 같은 곳이 다시 나오지
  -- 않는다")를 서버에서 지키려면 필요하다. 기본값이 있어 기존 호출은 그대로 동작한다.
  p_exclude_ids uuid[] default null
)
returns table (
  id uuid, name text, category text, road_address text,
  lat double precision, lng double precision,
  price_range smallint, memo text,
  distance_m double precision,
  avg_rating numeric, review_count bigint
)
language plpgsql
volatile                       -- random() 을 쓴다. stable 이면 플래너가 한 번만 부른다.
as $$
begin
  -- meal_type 은 로그에만 쓰이지만, 여기서 걸러야 오타가 조용히 넘어가지 않는다.
  if p_meal_type not in ('lunch','dinner') then
    raise exception 'meal_type 은 lunch 또는 dinner 여야 한다: %', p_meal_type;
  end if;

  return query
  -- base 를 두 번 참조하므로 Postgres 가 한 번만 계산해 재사용한다.
  -- restaurants_within 은 한 번만 돈다.
  with base as (
    -- 1~2. 반경 + 카테고리 + 가격대
    select w.* from restaurants_within(p_lat, p_lng, p_radius_m, p_categories) w
     where (p_max_price is null or w.price_range is null or w.price_range <= p_max_price)
       -- 세션 안에서 [다시 뽑기] 를 눌렀을 때 직전 결과를 뺀다 (WBS 4.4).
       -- 이건 폴백에서도 풀지 않는다. 풀면 [다시 뽑기] 가 같은 곳을 다시 준다.
       and (p_exclude_ids is null or w.id <> all(p_exclude_ids))
  ),
  fresh as (
    -- 3. 최근 p_exclude_days 일 안에 실제로 간(accepted) 곳 제외
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
    -- 4. fresh 가 0건이면 "최근 간 곳" 조건만 푼다. 반경·카테고리·가격대는
    --    사용자가 고른 조건이라 마음대로 넓히지 않는다.
    select * from fresh
    union all
    select * from base where not exists (select 1 from fresh)
  )
  -- 5~6. 가중 랜덤. weight = (avg_rating + 1) ^ 1.5 라 평점이 높을수록 자주 나오되
  --      신규(평점 0)도 weight 1 로 뽑힌다. -ln(random())/weight 가 가중 샘플링 표준 트릭.
  select * from pool
   order by -ln(random()) / power(coalesce(pool.avg_rating, 0) + 1, 1.5)
   limit 1;
end;
$$;
