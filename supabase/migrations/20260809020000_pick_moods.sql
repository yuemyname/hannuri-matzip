-- 점메추 강화 — 상황 태그 + 시간대 가중치 + 평점 신뢰도 보정 (2026-08-09 요청).
--
-- 지금까지 점심·저녁 후보가 똑같았다. `p_meal_type` 은 로그에만 쓰이고 뽑는 데는
-- 아무 영향이 없었다. "저녁엔 가벼운 것과 회식 위주" 를 하려면 맛집마다 그 성격을
-- 알아야 하는데, 가격대나 종류로는 유추가 잘 안 된다 — 비싸다고 회식감이 아니고
-- 한식이라고 혼밥집이 아니다. 그래서 **사람이 다는 태그**를 둔다.

alter table restaurants
  add column if not exists mood_tags text[] not null default '{}';

-- 어휘를 고정한다. 자유 입력이면 "회식"·"회식용"·"단체" 가 섞여서 가중치가 안 걸린다.
-- 카테고리와 달리 이건 **추천 알고리즘의 축**이라 값이 늘면 코드도 같이 바뀐다 —
-- DB 표로 빼지 않고 제약으로 둔 이유다.
alter table restaurants drop constraint if exists restaurants_mood_tags_valid;
alter table restaurants add constraint restaurants_mood_tags_valid check (
  mood_tags <@ array['혼밥', '가벼움', '회식', '술']::text[]
);

-- 태그로 거르지는 않고 가중치만 준다. 그래도 뽑을 때마다 배열을 훑으므로 인덱스를 둔다.
create index if not exists restaurants_mood_tags_idx
  on restaurants using gin (mood_tags);

-- ── pick_restaurant v2 ────────────────────────────────────────────────
-- 반환 열이 늘어서(mood_tags) create or replace 로는 못 바꾼다. 지우고 다시 만든다.
drop function if exists pick_restaurant(
  double precision, double precision, integer, text, text[], smallint, integer, uuid[]
);

create function pick_restaurant(
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
      --    (예전 식은 avg 0 → 가중치 1 이라 5점짜리보다 15배 불리했다.)
      ((p.avg_rating * p.review_count) + 3.5 * 3) / (p.review_count + 3) as score,
      -- 2) **시간대별 상황 가중치.** 점심엔 혼자 빨리, 저녁엔 같이 오래 —
      --    이걸 가격·종류로 유추하려 하지 않고 사람이 단 태그로 판단한다.
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
      -- 3) **가까울수록 조금 유리.** 반경 안이면 5m 든 195m 든 똑같던 것을 고친다.
      --    최대 1.3배까지만 — 거리로 결정되면 그건 추천이 아니라 정렬이다.
      1.0 + 0.3 * (1.0 - least(p.distance_m / greatest(p_radius_m, 1), 1.0)) as near
    from pool p
  )
  -- 가중 랜덤. -ln(random())/weight 가 표준 트릭이다.
  select s.id, s.name, s.category, s.road_address, s.lat, s.lng,
         s.price_range, s.memo, s.distance_m, s.avg_rating, s.review_count, s.mood_tags
    from scored s
   order by -ln(random()) / (power(s.score, 2.0) * s.mood * s.near)
   limit 1;
end;
$$;
