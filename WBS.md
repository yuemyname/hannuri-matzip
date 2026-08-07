# WBS.md — 사무실 맛집 지도 (lunchmap)

`SPEC.md`(설계) + `SHELL.md`(화면 구조) 기준 작업 분해.
각 태스크는 독립 커밋 단위이며,
**완료 조건(DoD)을 만족하지 못하면 다음 태스크로 넘어가지 않는다.**

진행 표기: `[ ]` 대기 / `[~]` 진행중 / `[x]` 완료

---

## P0 — 기반 (반나절)

### [x] 0.1 프로젝트 스캐폴딩
- `create-next-app` — TypeScript, Tailwind, App Router, `src/` 디렉터리
- ESLint + Prettier, `strict: true`
- 디렉터리 구조 생성:
  ```
  src/
    app/
      @modal/       # 인터셉트 모달 슬롯 (SHELL.md §1)
    components/     # 공용 UI
    features/
      map/          # 지도 컴포넌트 + 훅
      restaurants/
      reviews/
      pick/
    lib/
      supabase/     # client.ts, server.ts
      naver/        # 지역검색 프록시 유틸
    types/
  ```
- `@modal/default.tsx` 포함한 라우트 골격 (없으면 새로고침 시 404)
- **DoD**: `pnpm dev` 실행 시 빈 페이지 렌더, `pnpm build` 통과.
  `src/app/globals.css`는 `@import "tailwindcss"`만 있는 상태 (토큰은 0.5에서)

### [x] 0.2 Supabase 프로젝트 + 스키마
- PostGIS 확장 활성화
- `SPEC.md §2.1` 테이블 전부 마이그레이션 파일로 작성 (`supabase/migrations/`)
- `restaurant_stats` 뷰
- **DoD**: `supabase db reset` 후 스키마 재현 가능,
  테이블 6개 + 뷰 `restaurant_stats` 1개 존재 확인
- ⚠️ 작업 환경에서 Docker 이미지 레지스트리가 차단되어 `supabase db reset` 은 실행하지 못했다.
  `pnpm db:verify`(로컬 Postgres + shim)로 대체 검증했다. 로컬에서 1회 재확인 필요.

### [x] 0.3 RLS 정책
- `SPEC.md §2.3` 정책 전부 적용
- Storage 버킷 `review-photos` 생성 + 정책
- **DoD**: 세션 없는 상태(anon 키만)로 `select * from restaurants` 시 0건/거부,
  익명 세션 발급 후 조회 성공
- ⚠️ `pnpm db:verify` 로 검증. Storage 는 shim 의 근사치라 실물 동작은 미검증이다.
  SPEC §2.3 이 언급하지 않은 쓰기(메뉴, 리뷰 사진, 프로필 수정,
  recommendation_logs 수정)는 정책이 없어 전부 거부된다 — 5.3 / 5.4 / 4.4 전에 결정 필요.

### [ ] 0.4 익명 세션
> 로그인 UI 없음. 사용자는 인증이 있다는 사실 자체를 몰라야 한다.

- Supabase 콘솔에서 Anonymous Sign-in 활성화 + rate limit 설정
- 최초 진입 시 세션 없으면 `supabase.auth.signInAnonymously()` 자동 호출
  (레이스 방지: 동시 호출이 겹치지 않도록 단일 프로미스로 감쌀 것)
- `profiles` 자동 생성 트리거 — `display_name` 랜덤 부여 (형용사+명사+4자리)
- 세션 복구 실패 시 조용히 재발급, 사용자에게 에러 노출 금지
- **DoD**
  - 처음 접속한 브라우저에서 로그인 화면 없이 바로 메인이 뜬다
  - 새로고침·재방문 시 같은 `user_id` 유지
  - 시크릿 모드로 열면 다른 `user_id`가 발급된다
  - `profiles`에 닉네임이 자동 생성되어 있다

### [ ] 0.5 디자인 토큰 + 기본 컴포넌트
> P1부터 화면을 만들기 시작하므로, **그 전에** 색·타입·간격을 고정한다.
> 건너뛰면 화면마다 색이 미묘하게 달라지고 나중에 전부 되돌려야 한다.

- Pretendard Variable 로드 (`next/font/local` 또는 CDN, `font-display: swap`)
- `design-tokens.css` 내용을 `src/app/globals.css`로 이관
- shadcn/ui 초기화 (`pnpm dlx shadcn@latest init`) — Tailwind v4 모드
  - 추가할 컴포넌트만: `button` `input` `dialog` `sheet` `badge` `skeleton`
    `dropdown-menu` `switch` `toast` `alert-dialog`
  - **전체 추가(`--all`) 금지.** 안 쓰는 컴포넌트가 리뷰 대상이 된다.
- 프로젝트 전용 컴포넌트 3종 (`src/components/`)
  - `<Rating value={4.2} count={12} />` — 채워진 별 + **숫자 병기** (색만으로 정보 전달 금지)
  - `<CategoryChip category="한식" selected />` — 토글, 키보드 조작 가능
  - `<Distance meters={340} />` — 1000m 미만 `340m`, 이상 `1.2km`, `tabular-nums`
- `/design` 라우트에 토큰·컴포넌트 전수 나열 (개발 전용, 배포 시 `noindex`)
- **DoD**
  - `/design`에서 전 토큰과 3종 컴포넌트가 렌더됨
  - `rg -n '#[0-9a-fA-F]{6}' src --glob '!**/globals.css'` → **0건**
  - 360px 폭에서 `/design` 레이아웃 안 깨짐
  - Tab만으로 CategoryChip 토글 가능, 포커스 링 육안 확인

### [ ] 0.6 셸 + 모달 인프라
> `SHELL.md` 전체가 이 태스크의 스펙이다. 여기가 어긋나면 P3~P5를 전부 다시 짠다.

- `layout.tsx` — 헤더 + `@modal` 슬롯
- `<Modal>` 래퍼 — 모바일 Sheet / 데스크톱 Dialog 분기, `router.back()` 닫기
- `<PageShell>` 래퍼 — 풀페이지 fallback용 (뒤로가기 헤더 포함)
- `@modal/default.tsx`
- 더미 모달 1개로 전 경로 검증
- **DoD**
  - 메인 → 모달 열기 → 뒤로가기 → 모달 닫히고 **지도 뷰 유지**(줌·중심 그대로)
  - 모달 URL 새로고침 → 풀페이지로 정상 렌더
  - 모달 URL 복사 → 새 탭 붙여넣기 → 정상 진입
  - iOS Safari에서 주소창 노출/숨김 시 모달 하단이 잘리지 않음
  - Esc / 배경 탭 / 아래로 드래그 세 경로 모두 닫힘

---

## P1 — 지도 (핵심 리스크 구간, 먼저 뚫는다)

### [ ] 1.1 네이버 지도 최소 렌더 ⚠️ 최우선
> 이 태스크가 막히면 프로젝트 전체가 막힌다. 가장 먼저 검증한다.
> **P0.2보다 먼저 시도해도 좋다.**

- NCP 콘솔에서 Web Dynamic Map 앱 등록, **서비스 URL에 `http://localhost:3000` 추가**
- `next/script` + `ncpKeyId` 파라미터로 SDK 로드
- `<NaverMap />` 클라이언트 컴포넌트: 고정 좌표 지도 1개 표시
- `window.navermap_authFailure` 핸들러
- 타입 선언 (`@types/navermaps` 또는 자체 `.d.ts`)
- **DoD**: 로컬에서 지도 표시 + 콘솔 에러 0건. 스크린샷 확인.

### [ ] 1.2 Geolocation 훅
- `useCurrentPosition()` — `SPEC.md §5` 상태 머신 구현
- denied/timeout 시 폴백 좌표 + 배너
- "내 주변 찾기" 버튼 트리거 경로
- **DoD**: 브라우저 위치 권한 허용/거부 두 시나리오 모두 정상 동작

### [ ] 1.3 반경 Circle + 현재위치 마커
- `naver.maps.Circle` 반경 표시, 반경 변경 시 반지름 갱신
- 현재 위치 마커 (파란 점 + accuracy 원)
- 반경 변경 시 `map.fitBounds(circle.getBounds())`
- **DoD**: 500m/1km/1.5km 토글 시 원과 줌 레벨이 함께 변함

### [ ] 1.4 지도 뷰 상태 스토어
- zustand — `center / zoom / radius / selectedId`만 보관 (서버 데이터 금지)
- 메인 마운트 시 복원, 지도 이동 시 저장 (debounce)
- **DoD**: 풀페이지 fallback 진입 → 뒤로가기 → 지도가 이전 위치·줌으로 복원됨

---

## P2 — 맛집 조회

### [ ] 2.1 `restaurants_within` RPC
- `SPEC.md §3.1` 함수 작성
- GiST 인덱스 확인 (`explain analyze`로 Index Scan 확인 — Seq Scan이면 실패)
- **DoD**: 시드 데이터 기준 반경 1km 조회 결과가 육안으로 맞고, 실행 계획에 인덱스 사용됨

### [ ] 2.2 시드 데이터
- 사무실 주변 실제 맛집 15곳 + 메뉴 + 더미 리뷰 스크립트
- **DoD**: `pnpm seed` 로 재실행 가능(멱등)

### [ ] 2.3 맛집 마커 렌더
- RPC 결과 → 마커 생성, `icon.content` 커스텀 HTML (평점 뱃지)
- **마커 diff 갱신** — 기존 마커 전체 삭제 후 재생성 금지
- 마커 클릭 → 선택 상태
- **DoD**: 필터 변경 시 깜빡임 없음, 마커 수가 리스트 항목 수와 일치

### [ ] 2.4 리스트 + 필터바
- 맛집 카드 컴포넌트
- 반경 토글, 정렬(거리/별점/리뷰수), 카테고리 칩 다중 선택
- 모바일 드래그 시트 / 데스크톱 2단 분할
- **DoD**: 360px 폭에서 레이아웃 깨짐 없음

### [ ] 2.5 지도↔리스트 양방향 연동
- 카드 hover/focus → 마커 강조
- 마커 클릭 → 리스트 스크롤 + 하이라이트
- **DoD**: 양방향 모두 동작, 스크롤이 튀지 않음

---

## P3 — 리뷰

### [ ] 3.1 상세 화면 (모달 + fallback)
- `RestaurantDetail` 컴포넌트 1개를 `@modal/(.)restaurants/[id]`와
  `restaurants/[id]` 양쪽에서 사용 — **복붙 금지**
- 정보, 평점 분포, 메뉴, 리뷰 목록
- `dynamic()` 지연 로드
- **DoD**: 리뷰 0건 상태의 빈 화면도 자연스럽고, 모달·풀페이지 두 경로 모두 동일하게 보임

### [ ] 3.2 리뷰 작성/수정
- **상세 모달 내부 뷰 전환.** 별도 모달을 띄우지 않는다 (모달 2단 금지)
- 별점 선택 UI (키보드 조작 가능), 텍스트, 방문일
- upsert (unique 제약 활용), 본인 리뷰 수정/삭제 (삭제는 `AlertDialog`)
- **DoD**: 같은 유저가 두 번 작성 시도 → 기존 리뷰 수정으로 동작

### [ ] 3.3 사진 업로드
- 클라이언트 리사이즈(장변 1600px) + WebP 변환 → Storage 업로드
- 최대 3장, 업로드 진행 표시
- **DoD**: 5MB 원본 업로드 시 저장 용량 500KB 이하

### [ ] 3.4 평점 집계 반영
- 리뷰 작성 후 리스트/마커 평점 갱신 (TanStack Query invalidate)
- **DoD**: 리뷰 남기고 모달 닫으면 배경 리스트의 평균 별점이 즉시 반영됨

---

## P4 — 점메추 / 저메추

### [ ] 4.1 `pick_restaurant` RPC
- `SPEC.md §3.2` 로직 — 필터, 최근 제외, 가중 랜덤, 후보 0건 폴백
- **DoD**: 동일 파라미터로 20회 호출 시 결과가 분산되고, 평점 높은 곳이 더 자주 나옴

### [ ] 4.2 `/pick` 모달
- 시간대 기반 점심/저녁 기본값
- 필터 UI (카테고리, 가격대, 반경, 최근 제외 스위치)
- **DoD**: 필터 조합이 RPC 파라미터로 정확히 전달됨

### [ ] 4.3 추첨 애니메이션
- **서버 응답 수신 후** 셔플 애니메이션 1.2s → 결과 카드
- `prefers-reduced-motion` 시 즉시 표시
- **DoD**: 네트워크 느릴 때도 애니메이션 도중 결과가 바뀌지 않음

### [ ] 4.4 수락 / 재추첨 로그
- [여기로 갈게요] / [다시 뽑기] → `recommendation_logs` 기록
- [여기로] 선택 시 모달 닫고 배경 지도가 해당 맛집으로 이동 + 마커 선택
- 세션 내 재추첨 시 직전 결과 제외
- 후보 0건 안내 + [반경 넓히기]
- **DoD**: 연속 5회 재추첨 시 같은 곳이 다시 나오지 않음

---

## P5 — 등록 / 마이

### [ ] 5.1 네이버 지역검색 프록시
- `POST /api/places/search` — 서버에서만 secret 사용
- 응답 파싱: `lng = mapx/1e7`, `lat = mapy/1e7` — **실제 응답으로 1회 검증 후 확정**
- HTML 태그 제거(`<b>` 포함되어 옴), 최대 5건 제약 UI에 반영
- **DoD**: 실제 상호 검색 시 좌표가 지도상 올바른 위치에 찍힘

### [ ] 5.2 맛집 등록 모달
- `SHELL.md §4`의 3단계 방식: 검색 → **모달 축소 + 배경 지도로 핀 조정** → 부가정보
- **모달 안에서 `new naver.maps.Map()` 호출 금지**
- 검색 실패 시 수동 입력 경로
- 중복 등록 방지 (unique 위반 시 기존 맛집으로 안내)
- **DoD**: 지역검색 결과 없는 가게도 수동으로 등록 가능,
  핀 조정 중 지도 인스턴스가 1개인지 확인

### [ ] 5.3 메뉴 관리
- 상세 화면에서 메뉴 추가/수정/삭제, 대표메뉴 지정
- **DoD**: 대표메뉴가 추천 결과 카드에 노출됨

### [ ] 5.4 `/me` 모달
- 내 리뷰 / 내가 등록한 맛집 / 추천 히스토리
- 닉네임 변경
- **세션 소실 고지** — "이 기기에서만 내 기록으로 인식됩니다" 한 줄
- **DoD**: 각 섹션 빈 상태 UI 존재

---

## P6 — 마감

### [ ] 6.1 로딩 / 에러 / 빈 상태
- 스켈레톤, 에러 바운더리, 각 화면 빈 상태 문구
- **DoD**: 네트워크 차단 상태에서도 앱이 흰 화면으로 죽지 않음

### [ ] 6.2 접근성
- 키보드 전용 조작으로 전 플로우 완주
- 모달 focus trap, Esc 닫기, 닫은 뒤 트리거로 포커스 복귀
- 별점 색+숫자 병기, 포커스 링, 명도 대비 4.5:1
- **DoD**: 마우스 없이 진입→검색→리뷰 작성 완료 가능

### [ ] 6.3 Vercel 배포
- 환경변수 설정, **NCP 서비스 URL에 배포 도메인 추가**
- **DoD**: 실제 사내 폰(iOS Safari + Android Chrome)에서 GPS 동작 확인

### [ ] 6.4 시드 + 온보딩
- 사무실 주변 맛집 실데이터 입력
- 첫 사용자용 짧은 안내 (3스텝)
- **DoD**: 동료 2명이 설명 없이 리뷰 1건씩 작성 성공

---

## 순서 원칙

1. **P1.1(지도 렌더)을 P0.2보다 먼저 시도해도 좋다.** 외부 의존성 리스크가 가장 크므로,
   막힌다면 하루라도 빨리 아는 편이 낫다.
2. P0.5 / P0.6은 P1 이전에 반드시 끝낸다. 나중에 하면 전 화면을 다시 손봐야 한다.
3. P2까지 끝나면 이미 "쓸모 있는 앱"이다. P4(점메추)는 재미 요소이므로 P3 이후.
4. 각 P 단계 종료 시점에 `pnpm build` + 실기기 확인 1회.

## 하지 말 것

**데이터 / 로직**
- 네이버 플레이스 리뷰/평점 크롤링
- `st_distance(...) < radius` 형태의 반경 쿼리 (인덱스 미사용)
- 클라이언트 랜덤으로 추천 결과 결정
- `SUPABASE_SERVICE_ROLE_KEY` / 네이버 검색 시크릿의 클라이언트 노출

**지도**
- 마커 전체 삭제 후 재생성
- 지도 인스턴스 2개 이상 생성 (모달 안에서 새 지도 금지)

**화면 구조**
- `useState`로 여는 모달 (URL 없는 모달)
- 모달 위 모달 (`AlertDialog` 제외)
- 인터셉트 라우트와 fallback에 같은 UI를 복붙
- `100vh` 사용 (→ `dvh`)

**스타일**
- 컴포넌트 파일에 hex / raw px 하드코딩
- Tailwind 기본 팔레트 직접 사용 (`bg-orange-500`, `text-gray-600` 등)
- `styletron` / `baseui` 도입
- 별점을 색으로만 표현
- `dark:` 클래스 작성 (v1 다크모드 제외)
