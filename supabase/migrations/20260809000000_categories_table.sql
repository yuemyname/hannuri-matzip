-- 카테고리 목록의 정본을 코드에서 DB 로 옮긴다.
--
-- 지금까지는 src/lib/categories.ts 의 배열과 restaurants.category 의 check 제약이
-- 함께 정본이었다. 종류를 하나 늘리려면 배포가 필요했고, 등록하는 사람이 "여긴
-- 어디에도 안 맞는데" 싶으면 「기타」로 밀어 넣는 수밖에 없었다.
--
-- 이제 목록이 데이터다. 등록 폼에서 새 이름을 직접 넣으면 여기 한 줄이 생기고,
-- 관리자 화면이 이름을 고치거나 지운다.

create table if not exists categories (
  name       text primary key,
  -- 화면에 보이는 순서. 값 사이를 비워 둬서 나중에 사이에 끼워 넣을 수 있다.
  -- 직접 입력으로 생긴 것은 기본값(100)이라 씨앗 7개 뒤, 「기타」 앞에 선다.
  sort_order int  not null default 100,
  created_at timestamptz not null default now(),

  -- 한글·영문만. 낱말 사이 공백 한 칸은 허용하되 앞뒤·연속 공백은 막는다
  -- (그래서 폼에서 trim 을 안 해도 여기서 걸린다). 20자를 넘으면 칩이 줄을 먹는다.
  constraint categories_name_format check (
    name ~ '^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$'
    and char_length(name) between 1 and 20
  )
);

-- 지금까지 check 제약이 들고 있던 7종을 그대로 옮겨 심는다.
insert into categories (name, sort_order) values
  ('한식', 10), ('중식', 20), ('일식', 30), ('양식', 40),
  ('분식', 50), ('카페', 60),
  -- 「기타」는 항상 맨 뒤. 직접 입력으로 생긴 것들보다도 뒤에 둔다.
  ('기타', 900)
on conflict (name) do nothing;

-- 이미 등록된 맛집이 쓰던 종류가 씨앗 밖에 있으면 외래키가 걸린다. 먼저 채운다.
insert into categories (name)
select distinct r.category from restaurants r
 where not exists (select 1 from categories c where c.name = r.category)
on conflict (name) do nothing;

-- restaurants.category: 붙박이 check → 이 표를 가리키는 외래키.
--   on update cascade — 관리자가 이름을 고치면 붙어 있던 맛집이 따라온다
--   on delete restrict — 쓰이는 중인 종류는 못 지운다. 지우려면 먼저 옮겨야 한다
-- 제약 이름은 init 마이그레이션이 인라인 check 로 만들어 준 기본값이다.
-- 손으로 고친 DB 에서 이름이 다를 수 있으니 없으면 그냥 지나간다.
alter table restaurants drop constraint if exists restaurants_category_check;
alter table restaurants
  drop constraint if exists restaurants_category_fkey,
  add constraint restaurants_category_fkey
  foreign key (category) references categories(name)
  on update cascade on delete restrict;

-- 외래키 검사와 "이 종류에 몇 곳" 집계가 같은 인덱스를 쓴다.
create index if not exists restaurants_category_idx on restaurants (category);

-- ── RLS (SPEC §2.3 과 같은 규칙) ──────────────────────────────────────
alter table categories enable row level security;

-- 다시 돌려도 깨지지 않게. create policy 는 if not exists 를 안 받는다.
drop policy if exists categories_select on categories;
drop policy if exists categories_insert on categories;

-- 목록은 세션이 있으면 누구나 본다. 필터칩·등록 폼이 이걸 읽는다.
create policy categories_select on categories
  for select using (auth.role() = 'authenticated');

-- 등록하다 새 종류를 직접 적으면 그 자리에서 한 줄이 생긴다.
-- 형식은 위 check 제약이 지키므로 여기서 또 보지 않는다.
create policy categories_insert on categories
  for insert with check (auth.role() = 'authenticated');

-- **update / delete 정책은 일부러 없다.** 이름을 고치거나 지우는 건 관리자
-- 화면이 서버에서 service_role 로 한다. 정책이 없으면 앱에서는 전부 거부된다.
