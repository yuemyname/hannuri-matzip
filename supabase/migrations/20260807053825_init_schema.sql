-- hannuri-matzip 초기 스키마 — SPEC.md §2.1 (테이블), §2.2 (집계 뷰)
-- RLS 정책과 Storage 버킷은 WBS 0.3에서 별도 마이그레이션으로 추가한다.

create extension if not exists postgis;

-- 사용자 프로필
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- 맛집
create table restaurants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null
    check (category in ('한식','중식','일식','양식','분식','카페','기타')),
  address      text,
  road_address text,
  location     geography(Point, 4326) not null,
  price_range  smallint check (price_range between 1 and 4), -- 1:~8천 2:~1.2만 3:~2만 4:2만+
  phone        text,
  memo         text,                     -- "웨이팅 김, 12시 전 도착 추천" 같은 사내 팁
  naver_place_url text,
  created_by   uuid not null references profiles(id),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index restaurants_location_idx on restaurants using gist (location);
create unique index restaurants_name_loc_uniq
  on restaurants (lower(name), round(st_y(location::geometry)::numeric, 4),
                              round(st_x(location::geometry)::numeric, 4))
  where is_active;   -- 동일 위치 중복 등록 방지

-- 메뉴 (메뉴 단위 랜덤 추천용)
create table menus (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  price         integer,
  is_signature  boolean not null default false
);

-- 리뷰 (1인 1맛집 1리뷰, 수정은 upsert)
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  visited_on    date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create table review_photos (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references reviews(id) on delete cascade,
  storage_path text not null,
  ordinal    smallint not null default 0
);

-- 추천 로그 (중복 회피 + 통계)
create table recommendation_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  meal_type     text not null check (meal_type in ('lunch','dinner')),
  accepted      boolean,        -- null=미응답, true=여기 감, false=다시 뽑기
  created_at    timestamptz not null default now()
);
create index reco_logs_user_created_idx on recommendation_logs (user_id, created_at desc);

-- 집계 뷰 (SPEC §2.2)
create view restaurant_stats as
select r.id as restaurant_id,
       coalesce(round(avg(rv.rating)::numeric, 1), 0) as avg_rating,
       count(rv.id) as review_count
from restaurants r
left join reviews rv on rv.restaurant_id = r.id
group by r.id;
