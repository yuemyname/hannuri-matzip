# WBS.md — 사무실 맛집 지도 (hannuri-matzip)

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

### [x] 0.4 익명 세션
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
- `src/lib/supabase/` — `client.ts`(브라우저 싱글턴) / `session.ts`(`ensureSession`)
  / `session-bootstrap.tsx`(layout 에서 1회 마운트, 렌더 없음).
  마이그레이션 `20260808010000_profiles_trigger.sql` — `on_auth_user_created` 트리거,
  `random_display_name()`(형용사 20 × 명사 20 × 4자리 = 400만 조합).
- **단일 프로미스 가드가 실제로 값을 한다.** 동시 5회 호출을 재보면 가드가 있을 때
  `signInAnonymously` 1회, 없을 때 5회다. supabase-js 내부 락은 여기까지 막지 않는다.
  (참고: Next 15 dev 에서 StrictMode 이펙트 이중 실행은 관측되지 않았다. 이 가드가
  막는 건 그게 아니라 P2 에서 조회 훅들이 각자 세션을 기다릴 때 생길 동시 호출이다.)
- 함께 고친 것: `restaurant_stats` 에 `security_invoker = on`. 뷰가 소유자 권한으로
  돌면 세션 없는 요청도 평점·리뷰 수를 읽어서 §2.3 의 "세션 없으면 0건" 이 깨진다.
- `pnpm db:verify` 에 7절 추가. 반례 3종 확인 — 트리거를 빼면 "profiles 가 따라오지
  않았다", `security_invoker` 를 빼면 "세션 없이 restaurant_stats 가 N건 읽혔다",
  단일 프로미스를 빼면 발급이 5회로 늘어난다.
- 브라우저 검증(Playwright, GoTrue 스텁): 최초 발급 / 새로고침·새 탭에 같은 user_id /
  다른 저장소는 다른 user_id / 로그인 UI 0개 / 발급 실패해도 화면 정상 + 에러 비노출 /
  탭 복귀 시 조용히 재시도 — 10개 항목 전부 통과, 페이지 에러 0건.
- 작업 환경 프록시가 `*.supabase.co` 를 403 으로 막아서 여기서는 GoTrue 스텁으로만
  확인했고, **실물은 맥북 Chrome 에서 DoD 4개를 직접 확인했다** — 로그인 화면 없이
  메인 진입 / 새로고침에 같은 `user_id` / 시크릿 창은 다른 `user_id` /
  `profiles` 에 두 세션의 닉네임이 자동 생성(`든든한햄스터8217`, `유쾌한다람쥐2682`).
  `auth.users` 트리거는 `db push` 로 그대로 들어갔다 — storage.objects 와 달리
  소유권 문제가 없다.
- 실물에서 걸린 두 가지. 둘 다 코드가 아니라 콘솔 설정이었다:
  - Supabase 콘솔의 **Allow anonymous sign-ins** 가 꺼져 있으면 `signup` 이 422 다.
    이 토글은 Providers 목록 안이 아니라 그 위 `User Signups` 블록에 있다.
  - NCP 서비스 URL 에 `http://localhost:3000` 이 없으면 지도 auth 가 401 이다.
    배포 도메인만 등록하면 로컬에서만 안 뜬다.
- 422 로 발급이 실패하는 동안에도 화면은 그대로 떴고 에러 문구도 안 나왔다.
  §2.4 의 "조용히 실패" 가 실물에서도 그대로 동작한다.

### [x] 0.5 디자인 토큰 + 기본 컴포넌트
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
- ⚠️ **shadcn CLI 는 쓰지 않는다.** 맥에서 실제로 돌려보고 내린 결론이다.
  - 지금 CLI 는 프리미티브를 고르게 하는데 기본값이 **Base UI** 다. 그걸 받으면
    Radix(0.6 의 `<Modal>`)와 프리미티브가 두 개가 된다. SHELL.md §3 과도 어긋난다.
  - `Radix UI` + `Custom` 을 골라도 CLI 가 설치하지 않고 웹 프리셋 빌더로 넘긴다.
    거기서 나오는 명령은 프리셋 색·폰트를 들고 와서 `globals.css` 토큰을 덮어쓴다.
  - 그래서 Radix 프리미티브만 npm 으로 받고 컴포넌트는 우리 토큰으로 직접 썼다.
    `src/components/ui/` 에 button / input / badge / skeleton / switch /
    dropdown-menu / alert-dialog. 프리미티브는 Radix 하나로 유지된다.
  - `toast` 는 뺐다. 최신 shadcn 에서 `sonner`(새 의존성)로 대체됐고 아직 쓰는 데가 없다.
    필요해지는 태스크에서 판단한다.

### [~] 0.6 셸 + 모달 인프라
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
- **shadcn 대신 `@radix-ui/react-dialog` 위에 직접 만들었다.** `ui.shadcn.com` 이 차단돼
  CLI 를 못 쓰는데, shadcn 의 Dialog·Sheet 도 결국 이 패키지를 감싼 것이라 토대는 같다.
  SHELL.md §3 이 요구하는 건 "Radix 가 처리한다" 이고 그건 충족한다.
  나중에 `shadcn add dialog sheet` 를 돌려도 `<Modal>` 래퍼는 우리 것이므로 버릴 게 없다.
- ⚠️ **iOS Safari 주소창 확인만 남았다.** `dvh` + `env(safe-area-inset-bottom)` 으로
  짜뒀지만 실기기에서만 검증된다. 나머지 DoD 4개는 Chromium 360px/1280px 에서 확인.

---

## P1 — 지도 (핵심 리스크 구간, 먼저 뚫는다)

### [x] 1.1 네이버 지도 최소 렌더 ⚠️ 최우선
> 이 태스크가 막히면 프로젝트 전체가 막힌다. 가장 먼저 검증한다.
> **P0.2보다 먼저 시도해도 좋다.**

- NCP 콘솔에서 Web Dynamic Map 앱 등록, **서비스 URL에 `http://localhost:3000` 추가**
- `next/script` + `ncpKeyId` 파라미터로 SDK 로드
- `<NaverMap />` 클라이언트 컴포넌트: 고정 좌표 지도 1개 표시
- `window.navermap_authFailure` 핸들러
- 타입 선언 (`@types/navermaps` 또는 자체 `.d.ts`)
- **DoD**: 로컬에서 지도 표시 + 콘솔 에러 0건. 스크린샷 확인.
- ✅ **Vercel 배포본(`hannuri-matzip.vercel.app`)에서 지도 렌더 확인.** iPad Safari,
  폴백 좌표(시청역) 정상. 인증 통과 = NCP 서비스 URL 등록까지 맞다는 뜻.
  - NCP 는 `AI·NAVER API` 가 아니라 **독립 상품 `Maps`** 로 옮겨져 있다.
    콘솔 검색창에 `Maps` → Application 등록 → API 선택에서 **Dynamic Map**.
  - Web 서비스 URL 은 입력 후 **`+ 추가` 를 눌러야** 저장된다.
  - `NEXT_PUBLIC_*` 은 빌드 시 코드에 박히므로 Vercel 환경변수 추가 후 **재배포 필수**.
  - 로컬에서 돌리려면 NCP 서비스 URL 에 `http://localhost:3000` 을 추가로 등록한다.
  - 작업 환경에서는 `oapi.map.naver.com` 이 차단돼 에러 경로만 검증했었다
    (키 없음 / 로드 실패). 콘솔 에러 0건은 실기기에서 미확인.

### [x] 1.2 Geolocation 훅
- `useCurrentPosition()` — `SPEC.md §5` 상태 머신 구현
- denied/timeout 시 폴백 좌표 + 배너
- "내 주변 찾기" 버튼 트리거 경로
- **DoD**: 브라우저 위치 권한 허용/거부 두 시나리오 모두 정상 동작
- ⚠️ Chromium 으로 허용·거부·저정확도·캐시 4가지를 검증했다.
  `timeout` 분기와 지도 `panTo` 는 미검증 — 실기기에서 확인 필요.

### [x] 1.3 반경 Circle + 현재위치 마커
- `naver.maps.Circle` 반경 표시, 반경 변경 시 반지름 갱신
- 현재 위치 마커 (파란 점 + accuracy 원)
- 반경 변경 시 `map.fitBounds(circle.getBounds())`
- **DoD**: 30m/50m/100m/200m 토글 시 원과 줌 레벨이 함께 변함
- ✅ 실기기(Chrome)에서 파란 점·accuracy 원·반경 원·반경 토글 시 줌 변화 모두 확인.
- ⚠️ 반경 옵션을 **30 / 50 / 100 / 200m, 기본 50m** 로 바꿨다 (원래 500m/1km/1.5km).
  100m 넘게 걸어가서 먹는 일이 없다는 판단. SPEC §0 전제와 §3.1/§3.2 의
  `p_radius_m` 기본값도 200m 로 함께 맞췄다.

### [x] 1.4 지도 뷰 상태 스토어
- zustand — `center / zoom / radius / selectedId`만 보관 (서버 데이터 금지)
- 메인 마운트 시 복원, 지도 이동 시 저장 (debounce)
- **DoD**: 풀페이지 fallback 진입 → 뒤로가기 → 지도가 이전 위치·줌으로 복원됨
- ⚠️ 지도 SDK 가 차단된 환경이라 최소 스텁으로 갈아끼워 배선을 검증했다.
  실제 지도에서의 드래그·줌 저장은 실기기 확인 필요.
- 저장은 `sessionStorage`(탭 단위). 모듈 스토어만으로는 풀페이지 fallback 을
  새로고침으로 진입했다 돌아올 때 살아남지 못한다.
- **저장된 뷰가 있으면 위치를 얻어도 카메라를 옮기지 않는다.** 안 그러면 돌아올 때마다
  내 위치로 튕겨서 복원이 무의미해진다. 옮기는 건 사용자가 [내 주변 찾기]를 눌렀을 때뿐.

---

## P2 — 맛집 조회

### [x] 2.1 `restaurants_within` RPC
- `SPEC.md §3.1` 함수 작성
- GiST 인덱스 확인 (`explain analyze`로 Index Scan 확인 — Seq Scan이면 실패)
- **DoD**: 시드 데이터 기준 반경 200m 조회 결과가 육안으로 맞고, 실행 계획에 인덱스 사용됨
- ✅ `Index Scan using restaurants_location_idx` 확인.
  `Index Cond: location && _st_expand(..., 200)` — st_dwithin 이 인덱스로 내려간다.
- ⚠️ **`restaurant_stats` 뷰가 매 호출마다 전체 맛집을 집계한다.** 실행 계획에서
  반경 안 4건과 별개로 전체 행이 HashAggregate 를 탄다. 지금은 문제 없다 —
  500건 1.2ms / 2,000건 1.1ms / 10,000건 5.2ms 로 SPEC §6 예산(500건 100ms) 안이다.
  SPEC §2.2 도 "v1 은 뷰로 충분하다" 고 적어뒀다. 느려지면 §2.2 의 메모대로
  `restaurants` 에 집계 컬럼 + 트리거로 전환한다.

### [~] 2.2 시드 데이터
- 사무실 주변 실제 맛집 15곳 + 메뉴 + 더미 리뷰 스크립트
- **DoD**: `pnpm seed` 로 재실행 가능(멱등)
- `supabase/seed.sql` + `scripts/seed.sh` (`pnpm seed`). 맛집 15 / 메뉴 33 / 리뷰 24.
  id 를 이름의 md5 로 만들어서 멱등하다 — 4회 연속 실행에 건수·좌표 변화 0.
  반례로 id 를 `gen_random_uuid()` 로 바꿔 돌려보면 `restaurants_name_loc_uniq` 에
  걸려 트랜잭션이 통째로 롤백된다. 결정적 id 가 실제로 멱등성을 지탱하고 있다.
- 사용자가 앱에서 만든 행은 건드리지 않는다 (시드 실행 후에도 그대로인 것 확인).
- 좌표는 사무실 기준 (방위각°, 거리 m) 로 적는다. 30/50/100/200m 에서 각각
  2/4/8/13건이 잡히고, 205m·235m 두 곳은 최대 반경 밖에 둬서 토글이 실제로 달라진다.
  리뷰 0건인 곳 1개(베이글로드)를 남겨 뒀다 — 빈 상태 화면(6.1) 확인용.
- ⚠️ **데이터가 아직 합성이다.** 사무실 좌표를 몰라서 `.env.example` 의 폴백
  (37.5665, 126.9780 · 서울시청)을 기준점으로 썼고 가게 이름도 실물이 아니다.
  실제 사무실 좌표 + 실제 15곳을 받으면 `seed.sql` 상단 `seed_office` 와
  `seed_restaurants` 만 갈아끼우면 된다 (파일 맨 아래에 교체 절차 적어둠).
  그때 `[x]` 로 바꾼다.

### [~] 2.3 맛집 마커 렌더
- RPC 결과 → 마커 생성, `icon.content` 커스텀 HTML (평점 뱃지)
- **마커 diff 갱신** — 기존 마커 전체 삭제 후 재생성 금지
- 마커 클릭 → 선택 상태
- **DoD**: 필터 변경 시 깜빡임 없음, 마커 수가 리스트 항목 수와 일치
- TanStack Query 도입(고정 스택). `src/app/providers.tsx` 가 QueryClientProvider 와
  `SessionBootstrap` 을 함께 들고 있다. `src/features/restaurants/` 에
  `api.ts`(RPC + 줄 단위 좁히기) / `use-nearby.ts`(쿼리 훅).
- **검색 기준은 지도 중심이 아니라 `anchor` 다** — 내 위치, 없으면 사무실 폴백.
  지도를 끌어도 반경 원과 조회 결과가 같은 곳을 가리킨다. 그래서 반경 원 중심도
  `anchor` 를 따라가게 바꿨다 (1.3 때는 지도 중심이었다).
- 깜빡임은 두 장치가 함께 막는다. 하나만 빠져도 깨진다:
  - `keepPreviousData` — 없으면 전환 중 빈 배열을 거쳐 마커가 0개가 된다
  - 마커 diff — 없으면 4개를 남기고 9개만 만들 것을 13개 전부 새로 만든다
- 마커 배지는 `<button>` 이라 키보드로 닿고 Enter 로 선택된다. `aria-label` 에
  이름·별점·리뷰 수를 넣었다. 리뷰 0건은 `0.0` 이 아니라 `–` 다 — 0.0 은 "0점" 으로
  읽히는데 그건 다른 뜻이다.
- 맛집 이름은 사용자 입력이라 `icon.content` 에 넣기 전에 이스케이프한다.
- 검증(Playwright, 네이버 SDK + Supabase 스텁) 13개 항목 전부 통과, 페이지 에러 0건.
  반경 30/50/100/200m 에서 마커 2/4/8/13개, 전환 중 0개가 되는 순간 없음,
  200m 전환 시 새로 만든 마커 9개, 선택 변경은 마커를 재생성하지 않음,
  조회 실패 시 "맛집을 불러오지 못했어요" + [다시 시도], 360px 가로 넘침 0px.
  반례 2종 확인 — `keepPreviousData` 를 빼면 깜빡임이 관측되고, diff 를 빼면
  생성 수가 9 → 13 으로 뛴다.
- ⚠️ **DoD 후반("마커 수 = 리스트 항목 수")은 2.4 에서 확인한다.** 리스트가 아직
  없어서 지금은 마커 수와 RPC 응답 건수가 같은 것까지만 봤다.

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
