# SPEC.md — 사무실 맛집 지도 (hannuri-matzip)

> 사내 구성원이 현재 위치 반경 200m 내 맛집을 지도에서 탐색하고,
> 별점·리뷰를 남기고, 점메추/저메추 랜덤 추천을 받는 내부용 웹앱.

---

## 0. 스코프

### In scope (v1)
- 브라우저 GPS 기반 반경 내 맛집 지도
- 맛집 등록 / 수정 (구성원 누구나)
- 별점(1–5) + 텍스트 리뷰 + 사진 첨부
- 점메추 / 저메추 랜덤 추천 (필터 + 최근 중복 회피)
- 로그인 없는 익명 세션 (계정 생성·비밀번호 없음)
- **예약 안내** (2026-08-09 추가) — 예약을 받는 곳인지와 예약 링크만 들고 있다가
  바깥으로 보낸다. 앱 안에서 자리를 잡지는 않는다

### Out of scope (v1)
- **앱 안에서** 예약 잡기, 결제, 주문 (바깥 링크로 보내는 것까지만 한다)
- 외부 공개 / SEO
- 실시간 채팅, 알림
- 네이버 플레이스 리뷰 크롤링 (약관 리스크)

---

## 1. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript | strict mode |
| 스타일 | Tailwind CSS v4 + shadcn/ui | 토큰은 `design-tokens.css` 단일 소스 |
| 지도 | **NAVER Maps JS API v3 (Web Dynamic Map)** | 클라이언트 전용 |
| DB / Auth / Storage | Supabase (Postgres + PostGIS) | |
| 상태 | TanStack Query v5 + zustand(지도 뷰 상태만) | |
| 배포 | Vercel | HTTPS 필수 (Geolocation 요구사항) |

### 1.1 NAVER Maps 로딩 — 중요

```html
<!-- 현재 공식 파라미터는 ncpKeyId 다. ncpClientId 는 구버전이며 인증 실패한다. -->
<script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_CLIENT_ID&submodules=geocoder"></script>
```

- NCP 콘솔 → **Application 등록 → Web Dynamic Map** 활성화 → Client ID 발급
- **Web 서비스 URL 등록 필수**: `http://localhost:3000`, `https://<vercel-domain>` 둘 다 등록.
  누락 시 배포 후에만 인증 실패가 나서 디버깅이 오래 걸린다.
- Next.js에서는 `next/script`의 `strategy="afterInteractive"` + `onReady` 콜백으로 로드.
  SSR 중 `window.naver` 접근 금지 → 지도 컴포넌트는 전부 `'use client'` + `dynamic(..., { ssr: false })`.
- 인증 실패 감지: `window.navermap_authFailure = () => { ... }` 전역 함수 정의해서 사용자에게 폴백 UI 노출.
- 타입: `@types/navermaps` 설치, 없으면 `types/naver-maps.d.ts` 직접 선언.

### 1.2 환경변수

```
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=      # Web Dynamic Map Client ID (공개 OK, URL 제한으로 보호)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=            # 서버 라우트 전용, 절대 클라이언트 노출 금지
NAVER_SEARCH_CLIENT_ID=               # NAVER API HUB (지역검색), 서버 전용
NAVER_SEARCH_CLIENT_SECRET=           # 서버 전용
```

**사무실 좌표는 환경변수가 아니다** (2026-08-11). 예전에 `NEXT_PUBLIC_FALLBACK_LAT/LNG`
로 받았는데, 배포에 옛 값이 남아 있으면 코드를 고쳐도 배포본이 안 바뀐다 — 실제로
그 상태였다(구의동). 정본은 `features/map/config.ts` 의 `OFFICE` 하나다.

---

## 2. 데이터 모델

PostGIS 확장 사용: `create extension if not exists postgis;`

### 2.1 테이블

```sql
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
```

### 2.2 집계 뷰

```sql
create view restaurant_stats as
select r.id as restaurant_id,
       coalesce(round(avg(rv.rating)::numeric, 1), 0) as avg_rating,
       count(rv.id) as review_count
from restaurants r
left join reviews rv on rv.restaurant_id = r.id
group by r.id;
```

> 리뷰 수가 수천 건 넘어가면 `restaurants`에 `avg_rating`, `review_count` 컬럼을 두고
> 리뷰 insert/update/delete 트리거로 갱신하는 방식으로 전환. v1은 뷰로 충분하다.

### 2.3 RLS

- 전 테이블 `enable row level security`.
- `select`: `auth.role() = 'authenticated'` — 세션이 있으면 전부 조회 가능.
  익명 세션도 `authenticated` 롤을 받는다 (§2.4). 세션 없이 anon 키만 있으면 거부된다.
  단 `recommendation_logs` 는 본인 것만 보인다.

쓰기는 아래가 전부다. **표에 없는 동작은 정책이 없으므로 거부된다.**

| 테이블 | insert | update | delete |
|---|---|---|---|
| `profiles` | 정책 없음 — §2.4 트리거가 만든다 | `id = auth.uid()` | 정책 없음 — `auth.users` 삭제 시 cascade |
| `restaurants` | authenticated **+ `created_by = auth.uid()`** | `created_by = auth.uid()` | `created_by = auth.uid()` |
| `menus` | authenticated | authenticated | authenticated |
| `reviews` | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `review_photos` | 상위 리뷰가 본인 것 | 상위 리뷰가 본인 것 | 상위 리뷰가 본인 것 |
| `recommendation_logs` | `user_id = auth.uid()` | `user_id = auth.uid()` | 정책 없음 |

- **`restaurants insert` 에 `created_by` 를 묶는 이유**: 안 묶으면 남의 id 로 등록할 수
  있고, 그러면 update/delete 의 `created_by` 검사가 통째로 무의미해진다.
- **`menus` 는 등록자로 묶지 않는다.** 테이블에 `created_by` 가 없고, 메뉴는 "가보니
  이게 있더라" 로 채워지는 공유 정보다. 맛집 등록자만 고칠 수 있으면 메뉴가 거의
  안 채워진다. 맛집 본체(이름·좌표)는 정체성이라 등록자로 묶고, 메뉴는 푼다.
  대신 훼손 리스크를 §8 에 남긴다.
- **`review_photos` 는 상위 리뷰의 소유자로 판단한다.**
  `exists (select 1 from reviews rv where rv.id = review_id and rv.user_id = auth.uid())`
- **`recommendation_logs` 에 update 가 필요한 이유**: 뽑는 시점에 `accepted = null` 로
  insert 하고, 사용자가 [여기로] / [다시] 를 누르면 그 행을 update 한다 (§4.2).
- Storage 버킷 `review-photos`: 인증 사용자 읽기, 본인 경로(`{uid}/...`)만 쓰기.
  비공개 버킷이므로 읽기는 서명 URL 로 내려간다.

### 2.4 익명 세션

로그인 화면이 없다. 최초 진입 시 세션이 없으면 `supabase.auth.signInAnonymously()` 로
익명 세션을 발급한다. 사용자는 인증이 있다는 사실 자체를 몰라야 한다.

- Supabase 콘솔에서 Anonymous Sign-in 활성화 + rate limit 설정
- 익명 유저도 `auth.users` 에 행이 생기므로 `profiles.id` 참조는 그대로 유효하다
- 익명 유저도 `authenticated` 롤을 받는다 (`is_anonymous` 클레임으로만 구분).
  따라서 §2.3 정책이 그대로 동작한다
- `profiles` 자동 생성 트리거로 `display_name` 을 랜덤 부여 (형용사+명사+4자리)
- `signInAnonymously()` 는 앱 부트스트랩에서 한 번만, 단일 프로미스로 감싸 호출한다.
  동시 호출이 겹치면 세션이 두 번 발급된다

**세션은 브라우저에 저장된다.** 기기·브라우저가 바뀌거나 저장소를 비우면 다른 사용자가
되고, 내 리뷰·등록 기록이 따라오지 않는다. 이 사실을 `/me` 에 한 줄로 고지한다 (§4.5).

**접근 제한은 두지 않는다.** 사내 전용 전제를 포기했다 — URL 을 아는 사람은 누구나 쓸 수
있다. 이메일 도메인 화이트리스트는 이메일이 없는 익명 세션과 양립하지 않으므로 v1 에서
제외한다. 접근을 좁혀야 하면 사내망·VPN 등 앱 밖 수단으로 처리한다.

---

## 3. 핵심 RPC

### 3.1 반경 조회

```sql
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
```

> `st_dwithin` on `geography` + GiST 인덱스 → 인덱스 탄다.
> `st_distance(...) < 1000` 형태로 쓰면 풀스캔 되므로 **반드시 `st_dwithin`** 사용.

### 3.2 랜덤 추천

```sql
create or replace function pick_restaurant(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 200,
  p_meal_type text default 'lunch',
  p_categories text[] default null,
  p_max_price smallint default null,
  p_exclude_days integer default 7,
  p_exclude_ids uuid[] default null       -- 2026-08-10 부터 앱이 안 쓴다 (§4.2 뒤집힌 결정)
) returns table (...)  -- restaurants_within 컬럼 + mood_tags
```

로직:
1. `restaurants_within` 결과에서 시작
2. `p_categories`, `p_max_price` 필터
3. 최근 `p_exclude_days`일 내 해당 유저가 `accepted = true`로 기록한 맛집 제외
4. 남은 후보가 0이면 → 3번 제외 조건 해제 후 재시도 (그래도 0이면 빈 결과)
5. 가중치 랜덤 — **세 항목의 곱** (2026-08-09 개정, 이전은 `(avg_rating+1)^1.5`)

   ```
   weight = score^2  ×  mood  ×  near
   ```

   - **`score` — 평점 신뢰도 보정.** `(avg×n + 3.5×3) / (n+3)`.
     리뷰 1개짜리 별 5개가 리뷰 20개 4.5를 이기면 안 된다. 전체 평균(3.5) 쪽으로
     끌어당기되 리뷰가 쌓일수록 제 점수에 가까워진다. **리뷰가 없으면 정확히 3.5** —
     이전 식에서는 신규가 weight 1이라 1점짜리(2.83)보다도 불리했다. 아무도 안 가
     보면 영영 안 뽑히는 구조였다.
   - **`mood` — 시간대별 상황 가중치.** `restaurants.mood_tags` 를 본다.
     - 저녁: 회식 ×1.6, 가벼움 ×1.4, 술 ×1.2, 혼밥 ×0.8
     - 점심: 혼밥 ×1.5, 가벼움 ×1.2, 회식 ×0.5, 술 ×0.4

     태그가 없으면 1.0 — 어느 쪽으로도 안 기운다. `p_meal_type` 이 로그용을
     넘어 실제로 후보를 가르는 유일한 지점이다.
   - **`near` — 가까울수록 조금 유리.** `1 + 0.3×(1 − distance/radius)`.
     최대 1.3배까지만. 거리로 결정되면 그건 추천이 아니라 정렬이다.

6. `order by -ln(random()) / weight limit 1` (가중 샘플링 표준 트릭)

**상황 태그 (`mood_tags`)** — `혼밥 / 가벼움 / 회식 / 술` 네 개 고정. 어휘를 DB 제약으로
막는다. 자유 입력이면 "회식"·"회식용"·"단체"가 섞여서 가중치가 안 걸린다.
카테고리와 달리 **목록이 코드(`src/lib/moods.ts`)에 있다** — 추천 식의 계수와 1:1로
묶여 있어서, 값이 늘면 `pick_restaurant` 의 case 문도 같이 늘어야 하기 때문이다.
DB 표로 빼면 화면에서 추가할 수는 있는데 아무 가중치도 안 붙는 죽은 태그가 된다.

결과 카드는 **이 시간대에 밀어준 태그만** 이유로 적는다 ("저녁이라 회식·술 쪽을 더
자주 뽑아요"). 안 밀어준 태그까지 적으면 설명이 아니라 나열이고, 점심에 "회식이라
골랐어요"라고 적으면 그건 거짓말이다.

**결정론 금지**: 서버에서 `random()` 사용. 클라이언트 룰렛 애니메이션은 연출이며,
최종 결과는 서버 응답값으로 고정한다 (애니메이션이 결과를 결정하지 않음).

---

## 4. 화면 정의

> ⚠️ 이 절의 화면 **내용**(무엇을 보여주는가)은 유효하지만,
> **띄우는 방식**은 `SHELL.md`가 대체한다.
> 로그인 화면이 없으므로 모든 화면이 메인 위에 모달로 뜨며, 메인은 언마운트되지 않는다.
> 아래에서 "페이지"라고 쓰인 것은 전부 "모달 + 풀페이지 fallback"으로 읽는다.
> 충돌 시 `SHELL.md`가 우선.

### 4.1 `/` — 메인 (지도 / 리스트, 한 번에 하나)

> **2026-08-08 변경.** 원래는 지도 40vh + 리스트 드래그 시트, 데스크톱은 좌 리스트
> 40% / 우 지도 60% 2단이었다. 리스트를 걷어내고 **지도 한 장 + 하단 컨트롤 바**로
> 바꿨다. 같은 정보를 지도와 리스트 두 군데서 두 번 보여주고 있었고, 360px 에서는
> 지도가 40vh 밖에 안 남아 정작 지도를 보기 어려웠다.
>
> **2026-08-11 변경.** 리스트가 돌아왔다. 다만 그때 문제였던 "두 군데서 두 번"
> 은 아니다 — **한 번에 하나만** 보이고 왼쪽 위 [리스트|지도] 로 갈아탄다.

- **첫 화면은 리스트다.** 처음 들어온 사람이 알고 싶은 건 "여기서 뭐가 제일
  가깝나" 고, 그건 핀 스무 개보다 줄 세운 목록이 빨리 답한다.
- **새로고침하면 보던 쪽이 유지된다** (2026-08-11 정정). 처음엔 저장을 안 했는데,
  지도를 보다 새로고침하면 리스트로 튕겨서 보고 있던 자리를 잃었다. 카메라와
  같이 `map-store` 에 넣고 sessionStorage 로 저장한다 — 탭을 새로 열면 다시
  리스트라, "최초에는 리스트" 는 그대로 산다.
- **가까운 순 하나뿐.** 정렬 고르개를 두지 않는다. 별점순·가격순을 붙이면 셋 중
  무엇으로 보고 있는지 매번 확인해야 하는데, 점심 십오 분 안에 정하는 화면에서
  그건 일이 하나 느는 것이다.
- **보이는 대상은 지도와 같다** — 같은 조회 결과(`restaurants_in_bounds`)를 줄로
  세운 것뿐이다. 따로 조회하면 "지도엔 있는데 목록엔 없다" 가 생긴다. 종류 칩도
  양쪽에 똑같이 걸린다.
- 거리 기준을 **첫 줄에 적는다** — "한누리빌딩에서 가까운 순" / "내 위치에서
  가까운 순". 안 적으면 "가까운" 이 어디서부터인지 알 수 없다.
- **지도는 리스트 뒤에서 계속 살아 있다.** 걷어내면 (1) 조회 범위를 지도가
  들고 있어서 목록까지 비고, (2) 되돌아올 때 카메라가 튄다. 덮는 동안은
  `inert` 로 잠근다 — 안 잠그면 Tab 이 안 보이는 마커들을 지나간다.
- 등록 화면의 **핀 조정 단계에서는 무조건 지도**다 (SHELL.md §4). 그 단계는
  배경 지도를 끌어 핀을 맞추는 일이라 리스트가 덮고 있으면 할 수가 없다.
  고른 값은 안 건드리고 덮어쓰기만 하므로, 끝나면 보던 쪽으로 돌아온다.
- 전환 버튼은 **왼쪽 위**다. 오른쪽 위는 이미 [◎][🔍][+] 로 차 있다.
- 오른쪽 위 셋은 **세로로 쌓는다** (2026-08-11). 가로로 세우면 360px 에서 위쪽
  절반이 버튼 줄에 덮여 그 아래 지도가 안 보였다.
- 위치 안내 배너는 **위아래·좌우로 자리를 비켜 준다.** 위 왼쪽 전환 버튼과 오른쪽
  버튼 줄 사이로 들어가면 양쪽이 잘린 채로 읽힌다.
- **위치를 조르는 버튼은 [◎] 하나다** (2026-08-11). 예전에는 배너에 [내 주변 찾기]
  · [다시 시도] 가 붙어 있었는데, [◎] 가 정확히 같은 일을 한다 — 아직 못 얻었으면
  물어보고, 얻었으면 지도를 그리로 옮긴다. 배너는 **왜 이렇게 보이는지**만 말하고,
  고친 뒤 무엇을 누를지는 [◎] 를 가리킨다.
- 카테고리 칩에는 **그림자를 안 쓴다.** 여섯 개가 나란히 서면 각자의 흐린 그림자가
  이어져 줄 아래 옅은 회색 띠처럼 보인다. 불투명 배경 + 테두리 1px 이면 지도 위에서
  충분히 읽힌다 (그림자 대신 테두리가 이 앱의 기본이다 — CLAUDE.md).

레이아웃 (모바일·데스크톱 공통):
```
┌─────────────────────────────┐
│ [로고]                       │  헤더 48px — 이름만
├─────────────────────────────┤
│                        [+]  │  액션은 지도 오른쪽 위, 접혀 있다
│   NAVER Map                 │  펼치면 점메추 / 식당 등록 / MY
│   · 현재위치 파란 점          │
│   · 맛집 마커 (평점 뱃지)     │  남은 높이 전부
│                             │
│        ┌───────────────┐    │  마커를 고르면 그 한 곳만
│        │ 맛집카드 (1장) │    │  지도 위에 뜬다 (상세로 가는 링크)
│        └───────────────┘    │
│  (전체)(상세)                │  카테고리 칩 = 복수 선택, 평소엔 접혀 있다
└─────────────────────────────┘
```

- **조회 범위는 화면에 보이는 영역이다** (2026-08-09). 반경 토글과 반경 Circle 은
  없앴다. 줄을 당겨 넓히면 더 보이고 좁히면 덜 보인다 — 보이는 데까지가 곧 규칙이다.
  둘을 같이 두면 역할이 겹친다: 줄을 당기면 반경이 무시되고, 반경을 누르면 줄이 바뀐다.
  - 지도가 옮겨지면 그 자리로 다시 조회한다. `restaurants_in_bounds` 를 쓴다.
  - **반경은 점메추에만 남았다.** 점메추는 화면과 무관하게 "내 위치에서 N m" 다.
  - 카드에 적히는 거리는 **내 위치 기준**으로 클라이언트가 다시 잰다. 서버가 주는
    거리는 조회 기준점 기준이라, 지도를 옮기면 걸어갈 거리와 달라진다.
  - **한 화면에 뜨는 핀은 30개까지** (`MAX_PINS` = 격자 5×6). 상한을 "30개만
    그린다" 로 두지 않는다 — 그러면 나머지가 조용히 사라지고 사용자는 못 본 게
    있다는 것조차 모른다. 대신 화면을 격자로 나눠 **한 칸에 하나**만 그린다.
    칸 수가 곧 상한이라 아무것도 안 버리면서 개수가 고정된다 (`cluster.ts`).
    - 한 칸에 여럿이면 **숫자 원**이 된다. 이름을 안 쓴다 — 대표를 고르면 나머지가
      그 뒤에 숨은 것처럼 보이는데, 뜻은 "이 근처에 N곳" 이지 "대표는 어디" 가 아니다.
    - 원을 누르면 **고르는 게 아니라 연다.** 두 단계 확대하며 갈라진다.
    - **30개를 안 넘으면 아예 안 묶는다.** 묶는 건 넘칠 때의 대응이지 기본값이
      아니다 — 15곳뿐인데 원으로 합치면 이름을 보려고 확대를 두 번 해야 한다.
  - 한 번에 받아 오는 건 300곳(`FETCH_LIMIT`). 이건 "그리는 수" 가 아니라 "묶을
    재료" 다. 이걸 넘으면 진짜로 잘리는 것이고, 그때는 **조용히 자르지 않고** 말한다:
    "이 근처가 너무 넓어요 · 확대해 보세요". 잘렸는지는 한 건 더 받아서 안다 —
    딱 상한만큼 받으면 "마침 300곳" 과 구분이 안 된다.
  - **줌 13 미만이면 아예 조회하지 않는다** (`MIN_QUERY_ZOOM`). 그때는 마커도
    걷고 "조금 확대하면 맛집이 보여요" — 안 걷으면 좁혀서 봤을 때의 마커가
    떠 있는 채로 확대하라고 적힌 꼴이 된다.
  - 네이버의 `MarkerClustering` 서브모듈은 안 쓴다. 별도 JS 를 직접 호스팅해야
    하는 의존성이고, 격자 방식이면 30줄로 끝난다.

- **데스크톱도 같은 레이아웃.** 2단 분할을 없앴다.
- 카테고리 칩은 **복수 선택**이고, 고른 종류의 맛집만 마커로 남는다.
  별도 마커 필터가 있는 게 아니라 조회 조건이 바뀌는 것이다 — 마커는 항상
  조회 결과 배열을 그대로 그린다.
- 마커를 고르면 맛집 카드 1장이 지도 위에 뜬다. **지도에서 상세로 가는 유일한
  길이다.** 없애지 말 것 (리스트에서는 카드가 그 몫을 한다).
  리스트로 보는 동안에는 안 띄운다 — 목록에 같은 카드가 이미 있다.
- 정렬 고르개는 없다. 리스트는 언제나 가까운 순이고, 마커에는 순서가 없다.
- 컨트롤은 **지도 위에 떠 있다** (하단에 붙은 바가 아니다). 바로 두면 그만큼
  지도가 잘리는데, 컨트롤은 아래 몇 십 픽셀만 쓰면 되고 뒤의 지도는 계속 보이는
  게 낫다. 지도는 화면 바닥까지 내려온다.
  - 떠 있으므로 **배경·테두리·그림자가 필수다.** 지도 타일 위 투명 글자는
    지도 색에 따라 읽히다 만다.
  - 감싸는 층은 포인터 이벤트를 받지 않는다. 받으면 지도 아래쪽을 끌 수 없다.
- 로딩·조회 실패·빈 결과 안내는 **상태 알약**이 맡는다 (리스트가 하던 몫).
  지도 위 배너는 위치 문제만 말한다.
- 맛집 카드: 이름 / 카테고리 · 거리(m) / ★4.2 (12) / 가격대 / 사내 메모 1줄

지도 상세:
- 마커는 `naver.maps.Marker` + `icon.content` 커스텀 HTML (평점 표시)
- 화면 이동·필터 변경 시 마커 diff 갱신 — 전부 `setMap(null)` 후 재생성하지 말 것 (깜빡임)
- 마커 20개 초과 시 `MarkerClustering` 서브모듈 도입 검토 (v1은 불필요)

### 4.2 `/pick` — 점메추 / 저메추

- 진입 시 시간대로 기본값 결정: `11–15시 → 점심`, `그 외 → 저녁` (토글로 변경 가능)
- 필터: 카테고리(다중), 최대 가격대, 반경, "최근 일주일 간 곳 제외" 스위치
  (**기본 꺼짐** — 2026-08-11. 켜 두면 후보가 조용히 줄어드는데, 등록된 곳이
  몇십 곳뿐인 지금은 그게 "왜 안 나오지" 로만 남는다)
- **필터는 접었다 펴는 카드 안에 있고, 접힌 채로 시작한다** (2026-08-11 요청).
  다섯 칸을 늘 펴 두면 [뽑아줘] 와 결과가 화면 아래로 밀려서 뽑을 때마다
  스크롤을 내려야 했다. 이 화면에서 제일 자주 하는 일은 조건을 고치는 게
  아니라 그냥 뽑는 것이다.
  - 접혀 있어도 **지금 조건을 한 줄로 적는다** (`저녁 · 200m · 종류 전체 ·
    가격 상관없음 · 최근 7일 뺌`). 안 적으면 무엇으로 뽑는지 모른 채 누르게 되고,
    결과가 이상할 때 어디를 볼지도 모른다.
  - 접히면 안쪽을 **DOM 에서 뺀다.** 남기면 Tab 이 안 보이는 칩 스무 개를 지난다.
- **[뽑기]** → 서버 응답 먼저 수신 → **룰렛** → 결과 카드

  **연출 길이는 네트워크와 무관하게 정해져 있다** (2026-08-11 정정). 누른 시각
  기준으로 `등속 1.0s → 감속 2.8s → 정지 0.7s`, 합쳐서 4.5초다. 예전에는 응답이
  오는 순간부터 쟀는데, 응답은 보통 빨라서 등속 구간이 사실상 0이었다 — 누르자마자
  감속만 하고 서 버려서 "휙 지나갔다" 로 보였다. 응답이 1.0초보다 늦으면 그때까지
  등속으로 더 돈다 (어디 설지 모르는 채로 감속할 수는 없다).

  **세게 돌린다** (900°/s, 감속하며 3바퀴 이상). 처음엔 450°/s 에 한 바퀴 남짓만
  더 돌게 했는데, 감속 뒷부분이 너무 느려 "벌써 섰나" 로 보였다 — 시간은 다
  흘렀는데 눈에는 짧게 느껴진 것이다. 눈에 보이는 회전이 3.8초 이어진다.

  룰렛은 2026-08-11 에 진행 바를 대신했다. 바가 보여주던 "얼마나 남았나" 는
  1.2초짜리에서 알 필요가 없는 정보였다. 판은 대신 **무엇을 뽑는 중인지**를
  보여준다 — 칸 하나가 종류 하나고, 멈춘 칸이 곧 답이다.
  - 칸은 `useCategories()` 목록이다. 뽑힌 종류가 목록에 없으면(목록이 낡은 경우)
    그 종류를 칸으로 덧붙인다 — 멈출 칸이 없으면 엉뚱한 칸에 선다.
  - **응답 전에는 등속으로 돈다.** 어디에 멈출지 모르는데 감속을 시작하면
    "곧 멈춘다" 는 거짓말이 된다 (바가 왕복만 하던 것과 같은 이유다).
  - 응답이 오고 등속 구간이 끝나면 그 칸이 바늘에 오도록 감속한다.
    **판이 답을 정하는 게 아니라 답이 판을 세운다** (§3.2, CLAUDE.md).
    감속은 **제곱** ease-out 이다 — 첫 속도가 `2Δ/T` 라 등속 구간 속도와 얼추
    이어진다. 세제곱(`3Δ/T`)이면 감속이 시작될 때 판이 한 번 튕겨 보인다.
  - 감속이 끝나도 **0.6초는 멈춘 채로 서 있다.** 예전에는 서는 순간 결과 카드가
    판을 덮어서 어디에 섰는지 볼 틈이 없었고, 그래서 "돌기는 도나" 로 읽혔다.
  - `prefers-reduced-motion` 이면 **돌리지 않고 답 위에 세워** 0.6초 보여준다.
    연출을 통째로 건너뛰면 판이 한 번 번쩍이고 사라져서 오히려 어수선하다.
  - 뽑을 곳이 없었으면 아예 안 돌린다. 멈출 칸이 없는데 돌면 아무 칸에나 서고,
    그건 "이게 나왔다" 로 읽힌다.
  - 판은 **캔버스로 그린다** (2026-08-11 재작업). `conic-gradient` + 가운데 창은
    색 조각만 도는 것으로 보였다. 칸마다 이름을 부챗살 방향으로 박아야 룰렛이
    되는데, 그건 CSS 로는 못 한다.
    - **회전도 캔버스 안에서 한다** (2026-08-11 정정). 캔버스 요소에 CSS
      `transform` 을 걸면 크로미움에서는 도는데 실기기에서는 안 돌았다 —
      캔버스가 따로 합성 레이어로 올라가면 변환이 화면에 안 나타나는 경우가 있다.
    - 다만 프레임마다 **처음부터 다시 그리지는 않는다.** 그렇게 했더니 실기기에서
      뚝뚝 끊겼다 — 가변 글꼴 `fillText` 를 초당 400번 넘게 부르는 셈이다. 판은
      숨은 캔버스에 한 번 그려 두고, 프레임마다 그 그림을 돌려 붙인다
      (`drawImage` 한 번). 캔버스에 `rounded-full` 도 안 건다 — 판이 이미 원이라
      마스크가 하는 일이 없는데 합성 비용만 낸다. 백업 저장소는 2배까지만 키운다.
    - 칸 색은 카테고리 색의 **밝은 형제**(`--color-cat-*-vivid`)고 글자는 어두운
      잉크다. 칩 색은 흰 글자를 얹으려고 어둡게 잡은 것이라, 일곱을 한 판에
      모으면 탁한 파이가 된다. 색상 계열은 같아서 "이 색이 그 종류" 는 그대로다.
    - 색·글꼴은 `readToken()` 으로 토큰에서 읽는다. 캔버스는 CSS 를 모르니 값을
      넘겨야 하는데, 여기에 hex·px 를 적으면 토큰 정본이 두 군데가 된다.
    - 글자를 **위아래로 뒤집지 않는다.** 판이 통째로 도는 그림이라 판 좌표에서
      내린 판단은 돌아간 뒤엔 틀린다. 이대로 두면 착지 회전량이 정확히 이 각도를
      상쇄해서 **바늘에 선 칸은 언제나 똑바로 선다.** 나머지 칸이 기울어 보이는
      건 진짜 룰렛판과 같고, 읽어야 할 것은 선 칸 하나뿐이다.
  - 판은 `aria-hidden`. 색만으로 알리지 않는다는 규칙은 **칸에 박힌 이름**이
    지키고, 답은 바깥 `aria-live` 가 결과 카드로 읽는다.
  - 회전은 rAF 로 각도를 직접 굴린다. CSS 애니메이션 → 트랜지션으로 갈아타면
    그 순간 각도가 튄다. `prefers-reduced-motion` 이면 아예 안 켠다 — 전역
    미디어쿼리는 CSS 만 줄이고 JS 연출은 못 막는다.
- 결과 카드: 맛집명, 대표메뉴, 거리, 평점, [여기로 갈게요] / [다시 뽑기]
  - 뽑힌 시점에 `recommendation_logs` 에 `accepted = null` 로 행을 남긴다
  - [여기로] → 그 행을 `accepted = true` 로 update
  - [다시] → 직전 결과를 `accepted = false` 로 update하고 **전체에서 새로 뽑는다**
    - ⚠️ **뒤집힌 결정 (2026-08-10).** 원래는 "같은 세션 내 재추첨에서 해당 맛집
      제외" 였다. 사내 맛집은 한 동네에 몇 곳뿐이라 두세 번이면 후보가 바닥나고,
      그때부터는 뽑을 게 없다는 말만 나왔다 (실사용 신고). 후보를 좁혀 가는 것보다
      매번 새로 굴리는 쪽이 이 앱의 크기에 맞는다는 판단이다.
    - 그래서 **같은 곳이 연달아 나올 수 있다.** 그때는 결과 카드가 그 사실을
      한 줄로 적는다 — 안 적으면 [다시 뽑기] 가 안 먹은 줄로 읽힌다.
    - `p_exclude_ids` 는 DB 함수에 그대로 남아 있다. 기본값이 null 이라 안 넘기면
      없는 것과 같고, 마이그레이션은 덧붙이기만 한다.
- 후보 0건일 때: "반경을 넓히거나 필터를 풀어보세요" + [반경 200m로 넓히기] 버튼
- 접근성: 애니메이션은 `prefers-reduced-motion` 존중, 해당 시 즉시 결과 표시

### 4.3 `/restaurants/[id]` — 상세

- 헤더 이미지(리뷰 사진 최신 1장 or 카테고리 플레이스홀더)
- 평균 별점 + 리뷰 수 (**점수별 분포 막대는 없다** — 2026-08-08 제거.
  리뷰가 한 자릿수라 막대 다섯 줄이 알려 주는 게 아래 리뷰 목록과 겹쳤다)
- **예약 칸** (2026-08-11 정리). 별점 아래에 **항상 있다.**
  - 예전엔 제목 아래에 예약을 켠 곳만 조용히 [예약하기] 가 붙었다. 켠 집이
    하나도 없으니 화면 어디에도 「예약」이라는 글자가 없었고, "예약하기가 어디
    있냐" 가 나왔다. **비어 있으면 비었다고 적는다** (빈 상태는 행동 유도).
  - 링크가 있으면 [예약하기] (새 탭 + `noopener`), 링크 없이 켜져만 있으면
    "예약 받는 곳이에요" 를 글자로.
  - **href 로 쓰기 전에 `reservationUrlError` 로 한 번 더 본다.** DB 제약이
    막고 있지만, 제약보다 먼저 들어간 값이나 제약을 안 지나는 경로가 생기면
    여기가 마지막 문이다 — `javascript:` 가 통과하면 클릭 한 번에 스크립트가 돈다.
  - **등록한 사람에게만** [예약 정보 넣기]/[예약 고치기] 가 보인다. `restaurants_update`
    가 `created_by = auth.uid()` 라 남이 눌러 봐야 0행이 바뀐다. 그리고 그때
    PostgREST 는 **에러를 안 준다** — 그래서 `saveReservation` 은 바뀐 행을
    돌려받아 세고, 0이면 "등록한 사람만 고칠 수 있어요" 로 실패를 알린다.
    화면에서 감추는 건 눈에 보이는 방어일 뿐이고, 이 셈이 진짜 문이다.
  - 예약을 끄면 링크도 `null` 로 지운다. 남겨 두면 다시 켰을 때 옛 링크가 되살아난다.
- 메뉴 리스트 (대표메뉴 뱃지)
- 리뷰 목록 (작성자, 별점, 본문, 사진, 방문일)
- 내 리뷰 있으면 상단 고정 + [수정], 없으면 [리뷰 쓰기] CTA
- [네이버 지도에서 열기] 딥링크

### 4.4 `/restaurants/new` — 등록

1. 이름 입력 → **네이버 지역검색 API** 자동완성 (서버 라우트 프록시)
   - 후보를 고르면 **종류를 네이버 분류로 미리 정해 둔다** (2026-08-10, §4.8 과 같은 규칙).
     목록에 있으면 칩을 고르고, 없으면 「직접 입력」칸에 새 이름을 적어 둔다.
     못 뽑으면 그대로 두고 3단계에서 고르게 한다.
   - **사용자가 직접 적어 둔 값은 안 덮어쓴다.** 후보를 바꿔 볼 때마다 다시
     쳐야 하면 직접 입력을 못 쓴다.
2. 검색 결과 선택 → 이름/주소/좌표 자동 채움
3. **지도에서 핀 미세조정** (필수) — 지역검색 좌표가 부정확할 수 있음
   - 핀 단계에 들어갈 때 **지도를 검색 좌표로 옮긴다.** 안 옮기면 핀이 "내가 보던
     자리" 에 찍혀서 미세조정이 아니라 가게를 지도에서 처음부터 찾아가야 한다.
     직접 입력이라 좌표를 모르면 보던 자리에서 시작한다.
4. 카테고리, 가격대, 사내 메모, 대표메뉴 입력
5. 저장 → 상세 페이지 이동

> **네이버 지역검색 API 제약**: 2026-08 기준 이 API 는 네이버 개발자센터가 아니라
> **NAVER API HUB(NCP 중개 운영)** 에서 발급받는다. 개발자센터 앱 등록 폼의
> `사용 API` 목록에는 더 이상 `검색` 이 없다. 콘솔은
> `console.ncloud.com/naver-api-hub` → Application 등록 → `지역` 선택.
>
> 그래서 호출 정보가 예전 문서와 다르다:
>
> | | 개발자센터(구) | NAVER API HUB(현재) |
> |---|---|---|
> | 도메인 | `openapi.naver.com` | `naverapihub.apigw.ntruss.com` |
> | 경로 | `/v1/search/local.json` | `/search/v1/local` |
> | 헤더 | `X-Naver-Client-Id` | `X-NCP-APIGW-API-KEY-ID` |
> | 헤더 | `X-Naver-Client-Secret` | `X-NCP-APIGW-API-KEY` |
>
> **이 API 는 좌표를 안 받는다.** 파라미터가 `query` / `display` 뿐이라 "내 근처에서
> 찾아줘" 를 요청할 방법이 없다. 그냥 "써브웨이" 로 치면 전국 인기순이라 시청 근처
> 것들이 올라온다 (2026-08-09 실사용에서 확인).
>
> 그래서 **지역명을 검색어에 붙인다.** 지도 SDK 를 `submodules=geocoder` 로 이미
> 싣고 있어서 `naver.maps.Service.reverseGeocode` 로 "광진구 구의동" 을 얻는다.
> 키가 더 필요하지 않다.
>
> **질의는 하나가 아니라 셋이다** (2026-08-10 수정). 동·구·맨질의를 동시에 던져
> 결과를 합친다. 5건 제한이 **질의마다 따로** 걸리기 때문이다 — 좁은 질의 하나로
> 끝내면 그 5칸을 이름이 비슷한 것들이 채워 버리고, 옆 동에 있는 가게는 들어올
> 자리가 없다. 경복궁역에서 "써브웨이" 를 쳤을 때 경복궁점이 안 나오고 종로점이
> 먼저 나온 게 그 증상이었다 (2026-08-10 실사용에서 확인).
> - 같은 가게가 여러 질의에서 오면 이름 + 좌표 소수 4자리로 묶어 한 번만 보인다.
> - 한 질의가 실패해도 나머지로 답한다. **전부 실패했을 때만** 429/503 을 올린다.
> - 지역명은 **두 개까지**만 받는다. 하나가 곧 업스트림 호출 하나라, 안 막으면
>   클라이언트가 원하는 만큼 쿼터를 태울 수 있다.
> - 역지오코딩이 실패하거나 응답이 없으면(3초) 지역명 없이 찾는다. 등록을 막지 않는다.
> - 후보는 **현재 위치에서 가까운 순**으로 세우고 거리를 함께 적는다.
>   넓은 그물에 먼 데가 딸려 오지만, 지우지 않고 아래로 내린다.
>
> 쿼리스트링(`query`, `display`)은 그대로다. **최대 5건**만 반환되고,
> `mapx`/`mapy`가 WGS84 좌표 × 10^7 정수로 온다 → `lng = mapx / 1e7`, `lat = mapy / 1e7`.
> **2026-08-08 실제 응답으로 확인했다.** `경복궁` → `mapx "1269770162"` / `mapy "375788408"`
> → 126.9770162 / 37.5788408. 10^7 이 맞다. 그래도 구현은 스케일을 고정하지 않고
> 판정한다 — 과거 KATECH 이력이 있어서, 값이 한국 범위를 벗어나면 그 후보를 버린다.
> 검색 결과가 없으면 수동 입력 + 지도 핀 찍기 경로를 항상 열어둔다.

### 4.7 `/feedback` (2026-08-10 추가)

[+] 메뉴에서 여는 모달. 한 줄 적어 보내면 끝이고 **답장은 없다** — 신원이 없어서
(§2.4) 누구에게 답할지 물어볼 데가 없다. 그 사실을 화면에 적는다.

- **누가 썼는지 안 남긴다.** `user_id` 를 두면 익명 세션 id 가 붙는데, 답장에 쓸
  수도 없으면서 "누가 이런 말 했나" 는 볼 수 있게 된다. 내용과 시각만 쌓는다.
- 그래서 **내가 쓴 것도 다시 못 본다.** "내 것" 을 가려낼 열쇠가 없다.
- `feedback` 은 insert 정책만 있다. select 정책이 없으므로 anon 키로는 아무도
  못 읽고, 읽는 길은 `service_role` 을 쓰는 `/api/admin/feedback` 하나다.
- 보내고 나면 폼만 비우고 화면은 닫지 않는다. 쓰다 보면 보통 두세 개가 이어진다.
- 관리자 화면에 [피드백] 탭. 안 본 것이 위로, 그다음 최근 순. 할 수 있는 건
  **"봤다" 표시와 삭제뿐이다** — 내용은 못 고친다. 남이 쓴 말이라 고칠 이유가 없고,
  고칠 수 있으면 나중에 그게 원문인지 알 수 없다.

### 4.8 `/discover` 검색 (2026-08-10 추가)

처음 텅 빈 지도를 채우는 지름길. 지도 오른쪽 위 **[🔍]** 로 여는 모달이다.
[내 위치] 오른쪽·[+] 왼쪽에 항상 떠 있다 — [+] 안에 접어 뒀더니 처음 채울 때
제일 자주 눌러야 하는 것이 한 겹 숨어 있었다 (2026-08-10 이동).

> **"별점 4점 이상 / 후기 1000개 이상" 은 못 한다.** 지역검색 API 가 주는 필드는
> `title / link / category / description / telephone / address / roadAddress /
> mapx / mapy` 가 전부고 **별점도 후기 수도 없다** (2026-08-08 실제 응답으로 확인,
> route-check.mjs 픽스처). 플레이스 화면에서 긁어오는 건 약관 위반이라 §0 에서
> 이미 제외했다. 그러니 이 화면은 "좋은 집을 골라 준다" 를 팔지 않는다.

- **품질 판단은 사람이 한다.** 근처 가게를 뿌려 주고, 아는 집이면 탭 한 번에
  등록된다. 이름 치고 핀 찍는 과정이 빠지는 것이 이 화면의 값어치 전부다.
- 목록은 두 칸이고 **전체 12줄**이다. 위가 **내 지도에 있는 곳**, 아래가
  **네이버에서 찾은 아직 없는 곳**.
  - **우리 것이 주인공이다.** 12의 ¾ 인 9줄까지 우리 것이 가져가고, 남는 자리를
    네이버가 메운다 (9 + 3). 등록분이 9에 못 미치면 그만큼 네이버 쪽이 길어진다.
  - 양쪽 다 넘치면 감춘 개수를 화면에 적는다 — 조용히 자르지 않는다 (CLAUDE.md).
- **거르기는 자르기 전 전체로 한다.** 넷만 보고 거르면 다섯 번째로 가까운 등록분이
  네이버 후보로 다시 떠서, 눌러도 인덱스가 막는다.
- **찾는 조건은 양쪽에 다 걸린다** (2026-08-11 정정). 「분식」을 눌렀는데 위 칸에
  한식·카페가 그대로 남아 있었다 — 칩이 네이버 검색어만 좁히고 우리 칸은 안
  걸렀던 탓이다. 이름을 친 경우는 이름으로, 칩만 누른 경우는 종류로 거른다.
  옆에 적는 개수도 **거른 뒤의 수**다 — 전체를 적으면 「분식 31」로 읽힌다.
  - 다만 **거르는 건 화면에서만** 한다. 조회(`restaurants_in_bounds`)를 종류로
    좁히면 위의 중복 거르기가 같이 좁아져서, 다른 종류로 등록해 둔 집이 네이버
    후보로 다시 뜬다.
- 찾는 길이 셋이다. **한 번에 하나만 산다** — 둘이 동시에 살아 있으면 무엇으로
  찾았는지 화면만 봐서는 알 수 없다.
  1. **이름 입력** (2026-08-10 추가) — 두 글자부터. 치면 종류 칩이 풀린다.
  2. **종류 칩** — 누르면 입력칸이 비워진다.
  3. 둘 다 비면 `맛집` 으로 두루.
  어느 쪽이든 `{지역명} {질의}` 로 나가고, §4.4 와 같은 3중 그물(동·구·맨질의)을 탄다.
- **이미 등록된 곳은 뺀다.** 근처(±0.02°) 등록분을 한 번에 받아 `lower(name)` +
  좌표 4자리로 거른다 — `restaurants_name_loc_uniq` 와 같은 규칙이라, 후보에
  남은 것은 반드시 등록에 성공한다.
- 담을 때 채우는 값: 이름·좌표·주소·전화·플레이스 링크·종류(네이버 분류로 추정).
  가격대·메모·상황 태그는 **비운다.** 아는 사람이 상세에서 채우면 된다 —
  여기서 물어보면 "탭 한 번" 이 사라진다.
- **줄마다 예약 스위치** (2026-08-11 요청). 네이버가 주는 값이 아니라 — 지역검색
  응답에 예약 여부는 없다 — 아는 사람이 켜 주는 것이라 **기본은 꺼짐**이다.
  **링크는 여기서 안 묻는다.** 주소를 붙여넣게 하면 이 화면의 값어치가 사라진다.
  켜면 "링크는 담은 뒤 상세에서 넣어요" 만 알린다.
- **종류는 네이버 분류를 기준으로 자동으로 정한다** (2026-08-10).
  1. 우리 목록에 있으면 그것 (`matchCategory`)
  2. 없으면 네이버 **중분류**로 새 종류를 만든다 (`categoryFromNaver`).
     큰분류("음식점")는 분류가 아니고, 소분류("초밥")는 너무 잘아서 종류가 끝없이 는다.
     새 종류는 **맛집보다 먼저** 만든다 — FK 순서가 뒤집히면 등록이 통째로 실패한다.
  3. 그것도 못 뽑으면 그 줄에서만 칩으로 물어본다.
- 이름은 **한글·영문이 아닌 글자 앞에서 자른다.** 네이버 값에는 괄호·쉼표가
  섞인다 — `술집>바(BAR)`, `음식점>치킨(닭강정)`. 지우고 붙이면 「바BAR」 같은
  아무도 안 쓰는 이름이 되므로 자른다.
- 중분류가 **한 글자면 큰분류로 내려간다.** `술집>바(BAR)` 는 「바」보다 「술집」이
  낫다. 큰분류가 「음식점」이면 내려갈 데가 없으니 3단계(칩)로 간다.
- **막을 것만 목록으로 둔다** (`생활 / 여행 / 쇼핑 / 의료 …`). 반대로 "먹는 것"
  목록을 적으면 네이버가 큰분류로 쓰는 음식 이름을 다 알아야 하는데
  (`중식>중식당` 처럼 요리 이름이 큰분류로 오기도 한다) 그건 셀 수가 없다.
  잘못 들어온 종류는 관리자 화면 [종류] 탭에서 고치거나 지운다.
- 자동으로 정한 종류는 **줄에 적어 둔다.** 새로 만들어지는 경우는 그것도 적는다.
- **지도에 후보 핀을 뿌리지 않는다.** 진짜 마커와 섞이면 어느 게 등록된 곳인지
  알 수 없고, 담고 나면 어차피 마커로 뜬다.
- **네이버에서 온 줄은 초록 테두리 + 옅은 초록 배경** (`--color-naver` 계열).
  "아직 우리 것이 아니다" 를 알리는 표시라 등록 폼의 검색 결과에도 같이 쓴다.
  담고 나면 평범한 마커·카드가 되고 초록은 따라가지 않는다.
  색만으로 알리지 않도록 **"네이버 검색 결과" 를 글자로 함께 둔다.**
  `naver`(#03C75A)는 흰 배경 대비 1.9:1 이라 테두리·점 전용이고, 글자에는
  `naver-strong`(5.5:1 ✓ AA)을 쓴다.

### 4.5 `/me`

내가 쓴 리뷰, 내가 등록한 맛집, 최근 추천받은 곳 히스토리. 닉네임 변경.

세션 소실 고지 한 줄 — "이 기기에서만 내 기록으로 인식됩니다" (§2.4).

---

## 5. 위치 처리

```ts
navigator.geolocation.getCurrentPosition(ok, err, {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 60_000,
});
```

상태 머신: `idle → prompting → granted | denied | unavailable | timeout`

- **granted**: 좌표 사용, `sessionStorage`에 캐시(1분)
- **denied**: 사무실(`OFFICE`) 좌표 사용 + 상단에 "현재 위치를 사용할 수 없어 한누리빌딩 기준으로 표시 중" 배너 + [다시 시도]
- **timeout/unavailable**: denied와 동일 처리
- HTTPS 아니면 아예 동작 안 함 → 로컬 개발 시 `localhost`는 예외적으로 허용됨
- iOS Safari: 사용자 제스처 없이 호출하면 프롬프트가 무시되는 케이스 있음 → 첫 진입 시
  "내 주변 찾기" 버튼 클릭으로 트리거하는 경로를 반드시 제공

정확도(`coords.accuracy`)가 200m 초과면 "위치 정확도가 낮습니다" 힌트 표시.

---

## 6. 비기능 요구사항

- 메인 진입 → 지도 렌더 완료: 3G 기준 3초 이내
- `restaurants_within` 응답: 맛집 500건 기준 100ms 이내
- 모바일 우선, 최소 지원 폭 360px
- 다크모드는 v1 제외 (라이트 고정)
- 이미지: 리뷰 사진 업로드 시 클라이언트에서 `canvas`로 장변 1600px 리사이즈 + WebP 변환 후 업로드

---

## 7. 디자인 방향

> 구체적인 토큰 값(색 스케일, 타입 스케일, radius, shadow)은 `design-tokens.css`가
> 단일 소스다. 이 절은 그 의도를 설명한다.

- 사내 툴이지만 "매일 점심때 여는 앱"이므로 밝고 식욕 도는 톤
- 액센트: 따뜻한 오렌지-레드 계열 1색 + 중립 그레이 스케일
- 카드 라운드 16px, 그림자 최소화, 경계는 1px 라인 위주
- 별점은 채워진 별 + 숫자 병기 (색만으로 정보 전달 금지 — 접근성)
- 폰트: Pretendard Variable

---

## 8. 리스크 / 결정 필요 사항

| 항목 | 리스크 | 대응 |
|---|---|---|
| 네이버 지도 인증 | `ncpClientId` 오기입, 서비스 URL 미등록 | 개발 착수 시 최소 지도 1개 띄우는 것부터 검증 |
| 지역검색 좌표계 | 스케일/좌표계 변경 이력 있음 | 실제 응답 1회 검증 후 파서 확정 |
| 초기 데이터 공백 | 맛집 0건이면 앱이 죽은 것처럼 보임 | 시드 스크립트로 사무실 주변 15곳 선등록 |
| 세션 소실 | 저장소를 비우거나 기기를 바꾸면 내 리뷰·등록 기록이 끊김 | `/me`에 고지. 계정 연결(익명→이메일 승격)은 v2 논의 |
| 접근 제한 없음 | 사내 전용 전제를 포기해 URL을 아는 외부인도 등록·리뷰 가능 | v1은 감수. 좁혀야 하면 사내망·VPN 등 앱 밖에서 처리 |
| 어뷰징 | 익명이라 스팸 등록·평점 조작 비용이 낮음 | Anonymous Sign-in rate limit. 신고·차단은 v2 논의 |
| 메뉴 훼손 | `menus` 쓰기를 등록자로 안 묶어 누구나 지울 수 있음 | v1은 감수 — 안 묶어야 메뉴가 채워진다. 문제가 생기면 `created_by` 추가 후 조이기 |
| 네이버 리뷰 크롤링 | 약관 위반 | 하지 않음. 자체 리뷰만 |
