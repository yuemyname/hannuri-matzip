-- hannuri-matzip 시드 데이터 — WBS 2.2
--
--   pnpm seed
--
-- 멱등하다. 몇 번을 돌려도 같은 상태가 된다.
-- id 를 이름에서 md5 로 만들기 때문에 재실행이 새 행을 만들지 않고 기존 행을 갱신한다.
-- **사용자가 앱에서 만든 데이터는 건드리지 않는다** — 시드는 자기 id 만 손댄다.
--
-- ⚠️ 좌표는 아직 가짜다. 사무실 좌표(아래 seed_office)에서 방위각·거리로 찍은
--    합성 데이터라 이름도 실물이 아니다. 실제 15곳으로 바꾸는 방법은 이 파일 맨 아래.

begin;

-- ── 사무실 기준점 ────────────────────────────────────────────────────
-- 여기 한 줄만 바꾸면 15곳이 통째로 따라 움직인다.
-- .env 의 NEXT_PUBLIC_FALLBACK_LAT/LNG 와 같은 값을 쓴다.
create temp table seed_office on commit drop as
select 37.5665::double precision as lat, 126.9780::double precision as lng;

-- 이름에서 항상 같은 uuid 를 만든다. 멱등성의 근거.
create or replace function pg_temp.seed_id(kind text, key text)
returns uuid language sql immutable as $$
  select md5('hannuri-matzip:' || kind || ':' || key)::uuid;
$$;

-- ── 시드 작성자 ──────────────────────────────────────────────────────
-- restaurants.created_by / reviews.user_id 가 profiles 를 참조하고,
-- profiles.id 는 auth.users 를 참조한다. 그래서 auth.users 행이 먼저 있어야 한다.
--
-- 이 계정들은 로그인하지 않는다. FK 를 채우는 게 전부라 id 만 넣는다.
-- (GoTrue 가 쓰는 나머지 컬럼은 nullable 이거나 default 가 있다.)
insert into auth.users (id, email)
select pg_temp.seed_id('user', u.key), u.key || '@seed.hannuri-matzip.local'
from (values ('seed-a'), ('seed-b'), ('seed-c')) as u(key)
on conflict (id) do nothing;

-- display_name 은 §2.4 의 익명 닉네임 규칙(형용사+명사+4자리)을 그대로 따른다.
-- 시드가 만든 리뷰라는 게 화면에서 따로 티나지 않아야 한다.
insert into profiles (id, display_name)
values
  (pg_temp.seed_id('user', 'seed-a'), '느긋한너구리4812'),
  (pg_temp.seed_id('user', 'seed-b'), '배고픈고양이2037'),
  (pg_temp.seed_id('user', 'seed-c'), '성실한판다9154')
on conflict (id) do update set display_name = excluded.display_name;

-- ── 맛집 15곳 ────────────────────────────────────────────────────────
-- 좌표는 사무실에서 (방위각°, 거리 m) 로 적는다. 방위각은 북=0, 시계방향.
-- 걸어갈 거리라 20~240m 안에 흩어 놨다 — 반경 토글이 30/50/100/200m 이므로
-- 어느 단계를 골라도 결과가 비어 보이지 않는다.
create temp table seed_restaurants on commit drop as
select * from (values
  --  name              category  bearing  dist  price  phone          memo
  ('한누리해장국',     '한식',      15,    35,  2, '02-000-0001', '12시 정각엔 줄. 11시 50분에 가면 바로 앉는다'),
  ('청기와중화요리',   '중식',     140,    60,  2, '02-000-0002', '짬뽕 맵기 조절 됨. 곱빼기 무료'),
  ('스시하루',         '일식',     260,   120,  3, '02-000-0003', '런치 세트는 2시까지만'),
  ('파스타공방',       '양식',     300,    95,  3, '02-000-0004', '2인 이상이면 예약 받아준다'),
  ('엄마손분식',       '분식',      75,    28,  1, '02-000-0005', '떡볶이 1인분도 포장 된다'),
  ('커피어스',         '카페',     190,    45,  1, '02-000-0006', '자리 넓고 콘센트 많다. 오후 회의 대체용'),
  ('돈까스연구소',     '일식',      45,   150,  2, '02-000-0007', '치즈돈까스는 12시 넘으면 자주 품절'),
  ('명동칼국수',       '한식',     215,    70,  1, '02-000-0008', '겉절이 리필 눈치 안 준다'),
  ('버거스탠드',       '양식',     330,   180,  2, '02-000-0009', '주문 후 10분. 급할 땐 비추'),
  ('마라공방',         '중식',     100,   205,  2, '02-000-0010', '마라탕 재료는 g 단위 계산'),
  ('토스트팜',         '분식',     165,    22,  1, '02-000-0011', '아침 9시 전에만 세트 할인'),
  ('설렁탕집',         '한식',     280,   235,  2, '02-000-0012', '지하 1층. 간판이 작아서 지나치기 쉽다'),
  ('라멘야',           '일식',     125,   110,  2, '02-000-0013', '카운터석만 8자리. 혼밥 편하다'),
  ('샐러디',           '기타',     355,    88,  2, '02-000-0014', '전날 과식했을 때'),
  ('베이글로드',       '카페',      60,   165,  1, '02-000-0015', '베이글은 오후 3시면 대부분 나간다')
) as t(name, category, bearing_deg, dist_m, price_range, phone, memo);

insert into restaurants (
  id, name, category, road_address, location,
  price_range, phone, memo, created_by, is_active
)
select
  pg_temp.seed_id('restaurant', s.name),
  s.name,
  s.category,
  '시드 데이터 · 실제 주소 아님',
  st_project(
    st_makepoint(o.lng, o.lat)::geography,
    s.dist_m,
    radians(s.bearing_deg)
  ),
  s.price_range::smallint,
  s.phone,
  s.memo,
  pg_temp.seed_id('user', 'seed-a'),
  true
from seed_restaurants s, seed_office o
on conflict (id) do update set
  name         = excluded.name,
  category     = excluded.category,
  road_address = excluded.road_address,
  location     = excluded.location,
  price_range  = excluded.price_range,
  phone        = excluded.phone,
  memo         = excluded.memo,
  is_active    = excluded.is_active,
  updated_at   = now();

-- ── 메뉴 ────────────────────────────────────────────────────────────
create temp table seed_menus on commit drop as
select * from (values
  ('한누리해장국',   '뼈해장국',        10000, true),
  ('한누리해장국',   '순대국',           9000, false),
  ('한누리해장국',   '수육',            22000, false),
  ('청기와중화요리', '짬뽕',            11000, true),
  ('청기와중화요리', '짜장면',           8000, false),
  ('청기와중화요리', '탕수육 소',       18000, false),
  ('스시하루',       '런치 초밥 10pc',  19000, true),
  ('스시하루',       '연어덮밥',        14000, false),
  ('파스타공방',     '트러플 크림',     16000, true),
  ('파스타공방',     '봉골레',          15000, false),
  ('엄마손분식',     '떡볶이',           5000, true),
  ('엄마손분식',     '김밥',             4000, false),
  ('엄마손분식',     '라면',             4500, false),
  ('커피어스',       '아메리카노',       4500, true),
  ('커피어스',       '샌드위치',         7500, false),
  ('돈까스연구소',   '등심돈까스',      12000, true),
  ('돈까스연구소',   '치즈돈까스',      14000, false),
  ('명동칼국수',     '바지락칼국수',     9000, true),
  ('명동칼국수',     '만두',             6000, false),
  ('버거스탠드',     '치즈버거 세트',   13000, true),
  ('버거스탠드',     '감자튀김',         4000, false),
  ('마라공방',       '마라탕',          13000, true),
  ('마라공방',       '꿔바로우',        16000, false),
  ('토스트팜',       '햄치즈토스트',     4000, true),
  ('토스트팜',       '감자수프',         3500, false),
  ('설렁탕집',       '설렁탕',          11000, true),
  ('설렁탕집',       '도가니탕',        15000, false),
  ('라멘야',         '돈코츠라멘',      11000, true),
  ('라멘야',         '차슈동',          12000, false),
  ('샐러디',         '치킨 샐러드',      9500, true),
  ('샐러디',         '연어 포케',       12000, false),
  ('베이글로드',     '플레인 베이글',    3500, true),
  ('베이글로드',     '베이글 샌드위치',  8000, false)
) as t(restaurant_name, name, price, is_signature);

insert into menus (id, restaurant_id, name, price, is_signature)
select
  pg_temp.seed_id('menu', m.restaurant_name || '/' || m.name),
  pg_temp.seed_id('restaurant', m.restaurant_name),
  m.name, m.price, m.is_signature
from seed_menus m
on conflict (id) do update set
  name         = excluded.name,
  price        = excluded.price,
  is_signature = excluded.is_signature;

-- ── 리뷰 ────────────────────────────────────────────────────────────
-- 별점이 전부 4~5 면 정렬·필터가 도는지 안 보인다. 3점도 섞는다.
-- 리뷰 0건인 곳도 일부러 남겨 둔다 — 빈 상태 화면(WBS 6.1)이 실제로 필요하다.
create temp table seed_reviews on commit drop as
select * from (values
  ('한누리해장국',   'seed-a', 5, '해장 아니어도 그냥 맛있다. 깍두기가 진짜'),
  ('한누리해장국',   'seed-b', 4, '국물 진하고 좋은데 자리가 좁아요'),
  ('한누리해장국',   'seed-c', 5, '2주째 여기만 가는 중'),
  ('청기와중화요리', 'seed-a', 4, '짬뽕 국물이 시원해요. 면은 조금 무른 편'),
  ('청기와중화요리', 'seed-b', 3, '무난. 탕수육은 다음엔 안 시킬 듯'),
  ('스시하루',       'seed-a', 5, '이 가격에 이 퀄리티면 반칙'),
  ('스시하루',       'seed-c', 4, '런치 시간 놓치면 값이 확 뛰어요'),
  ('파스타공방',     'seed-b', 4, '트러플 향 진하게 나요. 양은 적당'),
  ('엄마손분식',     'seed-a', 4, '떡볶이는 국물 떡볶이 스타일. 호불호 있을 듯'),
  ('엄마손분식',     'seed-b', 5, '김밥이 의외로 여기 대표메뉴'),
  ('엄마손분식',     'seed-c', 3, '라면은 그냥 라면이에요'),
  ('커피어스',       'seed-b', 4, '오후에 노트북 펴기 좋아요'),
  ('돈까스연구소',   'seed-a', 5, '튀김옷 얇고 바삭. 소스 안 찍고 먹어도 된다'),
  ('돈까스연구소',   'seed-c', 4, '치즈돈까스 노려서 11시 50분에 갔더니 있었어요'),
  ('명동칼국수',     'seed-a', 4, '겉절이 때문에 갑니다'),
  ('명동칼국수',     'seed-b', 4, '면 양 많아요. 반 공기만 먹어도 배부름'),
  ('버거스탠드',     'seed-c', 3, '맛은 괜찮은데 점심시간에 10분은 길어요'),
  ('마라공방',       'seed-a', 4, '2단계도 꽤 매워요. 처음이면 1단계'),
  ('마라공방',       'seed-b', 5, '꿔바로우 시켜야 완성'),
  ('토스트팜',       'seed-c', 4, '아침 대용으로 좋아요'),
  ('설렁탕집',       'seed-a', 3, '간판 못 찾아서 세 바퀴 돌았어요. 맛은 평범'),
  ('라멘야',         'seed-b', 5, '혼밥하기 제일 편한 곳'),
  ('라멘야',         'seed-c', 4, '국물 짜다는 사람도 있던데 저는 딱 좋았어요'),
  ('샐러디',         'seed-a', 4, '과식한 다음날 지정석')
  -- 베이글로드는 리뷰 0건으로 남긴다 (빈 상태 확인용)
) as t(restaurant_name, author, rating, comment);

insert into reviews (id, restaurant_id, user_id, rating, comment, visited_on)
select
  pg_temp.seed_id('review', v.restaurant_name || '/' || v.author),
  pg_temp.seed_id('restaurant', v.restaurant_name),
  pg_temp.seed_id('user', v.author),
  v.rating::smallint,
  v.comment,
  -- 방문일이 전부 오늘이면 최신순 정렬이 검증되지 않는다. 3주에 걸쳐 흩는다.
  current_date - ((row_number() over (order by v.restaurant_name, v.author) % 21))::integer
from seed_reviews v
on conflict (restaurant_id, user_id) do update set
  rating     = excluded.rating,
  comment    = excluded.comment,
  visited_on = excluded.visited_on,
  updated_at = now();

commit;

-- ── 실제 데이터로 바꾸려면 ───────────────────────────────────────────
-- 1. seed_office 를 실제 사무실 좌표로 바꾼다 (.env 의 FALLBACK 값과 같은 값).
-- 2. seed_restaurants 의 이름·카테고리·방위각·거리를 실제 가게로 바꾼다.
--    좌표를 직접 알면 st_project(...) 자리를 st_makepoint(lng, lat)::geography 로 바꿔도 된다.
-- 3. seed_menus / seed_reviews 의 restaurant_name 을 맞춰 준다.
--
-- id 가 이름에서 나오므로 **이름을 바꾸면 옛 행이 남는다.** 이름을 갈아엎을 때는 먼저 지운다:
--   delete from restaurants where road_address = '시드 데이터 · 실제 주소 아님';
