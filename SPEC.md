# SPEC.md — 사무실 맛집 지도 (hannuri-matzip)

> 사내 구성원이 현재 위치 반경 200m 내 맛집을 지도+리스트로 탐색하고,
> 별점·리뷰를 남기고, 점메추/저메추 랜덤 추천을 받는 내부용 웹앱.

---

## 0. 스코프

### In scope (v1)
- 브라우저 GPS 기반 반경 내 맛집 지도 + 리스트
- 맛집 등록 / 수정 (구성원 누구나)
- 별점(1–5) + 텍스트 리뷰 + 사진 첨부
- 점메추 / 저메추 랜덤 추천 (필터 + 최근 중복 회피)
- 로그인 없는 익명 세션 (계정 생성·비밀번호 없음)

### Out of scope (v1)
- 예약, 결제, 주문
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
NAVER_SEARCH_CLIENT_ID=               # 네이버 개발자센터 (지역검색), 서버 전용
NAVER_SEARCH_CLIENT_SECRET=           # 서버 전용
NEXT_PUBLIC_FALLBACK_LAT=37.5665      # GPS 거부 시 사무실 좌표
NEXT_PUBLIC_FALLBACK_LNG=126.9780
```

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
  p_exclude_days integer default 7
) returns table (...)  -- restaurants_within 과 동일 컬럼
```

로직:
1. `restaurants_within` 결과에서 시작
2. `p_categories`, `p_max_price` 필터
3. 최근 `p_exclude_days`일 내 해당 유저가 `accepted = true`로 기록한 맛집 제외
4. 남은 후보가 0이면 → 3번 제외 조건 해제 후 재시도 (그래도 0이면 빈 결과)
5. 가중치 랜덤: `weight = (avg_rating + 1) ^ 1.5` — 평점 높은 곳이 더 자주, 하지만 신규(평점 0)도 뽑힘
6. `order by -ln(random()) / weight limit 1` (가중 샘플링 표준 트릭)

**결정론 금지**: 서버에서 `random()` 사용. 클라이언트 룰렛 애니메이션은 연출이며,
최종 결과는 서버 응답값으로 고정한다 (애니메이션이 결과를 결정하지 않음).

---

## 4. 화면 정의

> ⚠️ 이 절의 화면 **내용**(무엇을 보여주는가)은 유효하지만,
> **띄우는 방식**은 `SHELL.md`가 대체한다.
> 로그인 화면이 없으므로 모든 화면이 메인 위에 모달로 뜨며, 메인은 언마운트되지 않는다.
> 아래에서 "페이지"라고 쓰인 것은 전부 "모달 + 풀페이지 fallback"으로 읽는다.
> 충돌 시 `SHELL.md`가 우선.

### 4.1 `/` — 메인 (지도 + 리스트)

레이아웃 (모바일 우선):
```
┌─────────────────────────────┐
│ [로고]        [점메추] [프로필] │  헤더 56px
├─────────────────────────────┤
│                             │
│   NAVER Map                 │  40vh
│   · 현재위치 파란 점          │
│   · 반경 Circle (반투명)      │
│   · 맛집 마커 (평점 뱃지)     │
├─────────────────────────────┤
│ [30m][50m][100m][200m] ⇅거리순│  필터바
│ (한식)(중식)(일식)(양식)...    │  카테고리 칩 (가로 스크롤)
├─────────────────────────────┤
│ ▤ 리스트 (드래그 시트)        │
│   맛집카드 × N               │
└─────────────────────────────┘
```

- 데스크톱(≥1024px): 좌 리스트 40% / 우 지도 60% 2단 분할
- **지도↔리스트 양방향 하이라이트**: 리스트 카드 hover → 해당 마커 확대+bounce,
  마커 클릭 → 리스트 해당 카드로 스크롤 + 하이라이트 (모임판 프로토타입에서 쓴 패턴 재사용)
- 맛집 카드: 이름 / 카테고리 · 거리(m) / ★4.2 (12) / 가격대 / 사내 메모 1줄

지도 상세:
- `naver.maps.Circle` 로 반경 시각화 (`strokeOpacity: 0.4, fillOpacity: 0.06`)
- 마커는 `naver.maps.Marker` + `icon.content` 커스텀 HTML (평점 표시)
- 반경/필터 변경 시 마커 diff 갱신 — 전부 `setMap(null)` 후 재생성하지 말 것 (깜빡임)
- 마커 20개 초과 시 `MarkerClustering` 서브모듈 도입 검토 (v1은 불필요)

### 4.2 `/pick` — 점메추 / 저메추

- 진입 시 시간대로 기본값 결정: `11–15시 → 점심`, `그 외 → 저녁` (토글로 변경 가능)
- 필터: 카테고리(다중), 최대 가격대, 반경, "최근 일주일 간 곳 제외" 스위치
- **[뽑기]** → 서버 응답 먼저 수신 → 슬롯머신/카드 셔플 애니메이션 1.2s → 결과 카드
- 결과 카드: 맛집명, 대표메뉴, 거리, 평점, [여기로 갈게요] / [다시 뽑기]
  - 뽑힌 시점에 `recommendation_logs` 에 `accepted = null` 로 행을 남긴다
  - [여기로] → 그 행을 `accepted = true` 로 update
  - [다시] → 직전 결과를 `accepted = false` 로 update, 같은 세션 내 재추첨에서 해당 맛집 제외
- 후보 0건일 때: "반경을 넓히거나 필터를 풀어보세요" + [반경 200m로 넓히기] 버튼
- 접근성: 애니메이션은 `prefers-reduced-motion` 존중, 해당 시 즉시 결과 표시

### 4.3 `/restaurants/[id]` — 상세

- 헤더 이미지(리뷰 사진 최신 1장 or 카테고리 플레이스홀더)
- 평균 별점 + 분포 막대(5→1), 리뷰 수
- 메뉴 리스트 (대표메뉴 뱃지)
- 리뷰 목록 (작성자, 별점, 본문, 사진, 방문일)
- 내 리뷰 있으면 상단 고정 + [수정], 없으면 [리뷰 쓰기] CTA
- [네이버 지도에서 열기] 딥링크

### 4.4 `/restaurants/new` — 등록

1. 이름 입력 → **네이버 지역검색 API** 자동완성 (서버 라우트 프록시)
2. 검색 결과 선택 → 이름/주소/좌표 자동 채움
3. **지도에서 핀 미세조정** (필수) — 지역검색 좌표가 부정확할 수 있음
4. 카테고리, 가격대, 사내 메모, 대표메뉴 입력
5. 저장 → 상세 페이지 이동

> **네이버 지역검색 API 제약**: `GET https://openapi.naver.com/v1/search/local.json`,
> 헤더 `X-Naver-Client-Id` / `X-Naver-Client-Secret`. **최대 5건**만 반환되고,
> `mapx`/`mapy`가 WGS84 좌표 × 10^7 정수로 온다 → `lng = mapx / 1e7`, `lat = mapy / 1e7`.
> 좌표 스케일은 구현 시작 시 실제 응답으로 반드시 1회 검증할 것 (과거 KATECH 좌표였음).
> 검색 결과가 없으면 수동 입력 + 지도 핀 찍기 경로를 항상 열어둔다.

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
- **denied**: 사무실 폴백 좌표 사용 + 상단에 "현재 위치를 사용할 수 없어 사무실 기준으로 표시 중" 배너 + [다시 시도]
- **timeout/unavailable**: denied와 동일 처리
- HTTPS 아니면 아예 동작 안 함 → 로컬 개발 시 `localhost`는 예외적으로 허용됨
- iOS Safari: 사용자 제스처 없이 호출하면 프롬프트가 무시되는 케이스 있음 → 첫 진입 시
  "내 주변 찾기" 버튼 클릭으로 트리거하는 경로를 반드시 제공

정확도(`coords.accuracy`)가 200m 초과면 "위치 정확도가 낮습니다" 힌트 표시.

---

## 6. 비기능 요구사항

- 메인 진입 → 지도+리스트 렌더 완료: 3G 기준 3초 이내
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
