-- 종류부터 공평하게 뽑는다 (2026-08-12 요청: "한식이 너무 많이 나와").
--
-- 지금까지는 **곳 단위**로 뽑았다. 알고리즘에 카테고리 항이 아예 없었으니
-- 근처에 한식이 15곳, 카페가 3곳이면 한식이 그대로 5배 자주 나왔다. 그 자체는
-- 설계대로였지만, 화면의 룰렛은 칸을 똑같은 크기로 그려서 "종류는 공평하다" 고
-- 약속하는 것처럼 읽힌다. 보이는 것과 실제가 어긋나 있었다.
--
-- 그래서 **두 단계로 뽑는 것과 같게** 만든다.
--
--   1) 후보에 남은 종류 중 하나를 고른다 — 종류마다 같은 확률
--   2) 그 종류 안에서 기존 가중치(평점·무드·가격대·거리)로 한 곳을 고른다
--
-- 구현은 단계를 나누지 않는다. 각 곳의 가중치를 **제 종류의 가중치 합으로**
-- 나누면 종류 하나가 통째로 무게 1이 되고, 그게 곧 위 두 단계와 같은 분포다.
-- (P(i) = (1/K) · wᵢ/W_c. K = 후보에 남은 종류 수, W_c = 그 종류의 가중치 합)
--
-- 뒤집으면 이렇다: **곳이 하나뿐인 종류도 열다섯 곳짜리 종류와 같은 확률이다.**
-- 점메추의 목적이 "가장 그럴듯한 한 곳" 이 아니라 "오늘 뭐 먹지" 를 끊어 주는
-- 것이라, 골고루 도는 쪽이 맞다고 봤다. 카테고리를 골라 뒀으면 그 안에서만
-- 공평하다 — 「한식·중식」만 골랐으면 둘이 반반이다.
--
-- 종류 안에서의 순위는 **하나도 안 바뀐다.** 평점 높은 곳이 여전히 유리하고,
-- 점심·저녁 기울기도 그대로다. 바뀐 건 종류들 사이의 배분뿐이다.
--
-- 곁들여 `-ln(random())` 을 `-ln(1 - random())` 으로 바꿨다. random() 은 0 을
-- 낼 수 있고 ln(0) 은 예외다 — 아주 드물게 점메추가 통째로 터진다. 1 - random()
-- 은 (0, 1] 이라 그 구멍이 없다. 분포는 같다.

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
  ),
  weighted as (
    select s.*, power(s.score, 2.0) * s.mood * s.price_fit * s.near as w
      from scored s
  ),
  fair as (
    -- **종류별 무게 합.** 이걸로 나누면 종류 하나가 통째로 무게 1이 되어,
    -- 종류를 먼저 공평하게 고른 것과 같아진다. 종류 안의 순위는 그대로다.
    select f.*, sum(f.w) over (partition by f.category) as cat_w
      from weighted f
  )
  -- 가중 랜덤. -ln(1-random())/weight 가 표준 트릭이다.
  select s.id, s.name, s.category, s.road_address, s.lat, s.lng,
         s.price_range, s.memo, s.distance_m, s.avg_rating, s.review_count, s.mood_tags
    from fair s
   order by -ln(1 - random()) / (s.w / greatest(s.cat_w, 1e-9))
   limit 1;
end;
$$;
