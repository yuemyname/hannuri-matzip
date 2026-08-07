# CLAUDE.md — lunchmap

사무실 맛집 지도. 사내 구성원용 Next.js 웹앱.
설계는 `SPEC.md`, 작업 순서는 `WBS.md`. **둘이 충돌하면 SPEC이 이긴다.**

## 작업 방식

- WBS 태스크 하나 = 커밋 하나. DoD를 만족하기 전에 다음 태스크로 넘어가지 않는다.
- 태스크 완료 시 WBS.md의 해당 항목을 `[x]`로 바꾸고 같은 커밋에 포함한다.
- 태스크 시작 전 해당 SPEC 절을 읽는다. SPEC에 이미 정해진 건 다시 제안하지 않는다.
- SPEC에 없는 결정이 필요하면 **추측하지 말고 물어본다.** 특히 스키마, 외부 API 파라미터.
- 파일을 새로 만들기 전에 기존 파일에 넣을 자리가 있는지 먼저 본다.

## 스택 (고정)

Next.js 15 App Router / TypeScript strict / Tailwind CSS v4 / shadcn/ui
Supabase (Postgres + PostGIS) / TanStack Query v5 / zustand(지도 뷰 상태만) / Vercel

새 의존성 추가는 먼저 제안하고 승인받는다. 특히 UI 라이브러리, 애니메이션 라이브러리,
날짜 라이브러리는 기본적으로 거절이라고 생각할 것.

## 화면 구조 — 단일 셸 (중요)

이 앱은 **메인 화면 하나 위에서 동작한다.** 지도+리스트가 항상 배경에 살아있고,
다른 화면은 그 위에 모달로 뜬다. 자세한 규칙은 `SHELL.md`.

- 새 화면을 만들 때 기본 답은 **모달**이다. 풀페이지 라우트는 `/login` 뿐이다.
- 구현은 Intercepting Routes(`@modal` 슬롯). `useState`로 여는 모달 금지 —
  URL이 안 남으면 뒤로가기·공유·새로고침이 전부 깨진다.
- 모든 모달 경로는 **풀페이지 fallback을 함께 만든다** (직접 진입·새로고침용).
- **모달은 1단까지.** 모달 위에 모달 금지. 확인 대화상자(AlertDialog)만 예외.
- 지도 인스턴스는 앱 전체에서 **하나만** 존재한다. 모달 안에서 지도를 새로 만들지 않는다.

## 스타일 규칙

### 토큰
- 색·폰트·간격·radius·shadow는 **전부 `src/app/globals.css` 토큰 경유.**
  컴포넌트 파일에 hex나 raw px가 들어가면 실패다.
- Tailwind 기본 팔레트 사용 금지. `bg-orange-500` ✗ → `bg-brand-600` ✓,
  `text-gray-500` ✗ → `text-ink-500` ✓
- 의미가 있는 곳은 시맨틱 이름을 우선한다: `text-muted-foreground` > `text-ink-500`
- 새 토큰이 필요하면 컴포넌트에서 만들지 말고 `globals.css`에 추가한 뒤 쓴다.

### 색 사용
| 용도 | 토큰 |
|---|---|
| 본문 텍스트 | `text-foreground` (ink-800) |
| 보조 텍스트 | `text-muted-foreground` (ink-500) |
| 경계선 | `border-border` (ink-200), 1px |
| 주요 버튼 | `bg-primary text-primary-foreground` (brand-600) |
| 흰 배경 위 브랜드 텍스트/링크 | `text-brand-700` |
| 지도 마커 | `bg-brand-500` |
| 별점 | `text-star` + **숫자 병기** |

- `brand-500`은 대비 3.5:1이라 **본문 텍스트 배경으로 쓰지 않는다.** 아이콘·마커·큰 면적만.
- 정보를 색으로만 전달하지 않는다. 별점, 카테고리, 상태 전부 텍스트 라벨을 함께 둔다.

### 레이아웃
- 모바일 우선. **최소 지원 폭 360px** — 새 화면은 360px에서 먼저 확인한다.
- 데스크톱 분기는 `lg:` (1024px) 하나만 쓴다. 중간 브레이크포인트 남발 금지.
- 카드 radius는 `rounded-lg`(16px). 그림자 대신 `border` 1px이 기본.
- 다크모드 v1 제외. `dark:` 클래스 작성 금지.

### 접근성 (WBS 6.2가 나중에 이걸 검사한다 — 처음부터 지킨다)
- 인터랙티브 요소는 전부 키보드 도달 가능. `div` + `onClick` 금지, `button` 사용.
- 포커스 링은 전역 `:focus-visible`이 처리한다. `outline-none`만 단독으로 쓰지 말 것.
- 텍스트 명도 대비 4.5:1 이상.
- 애니메이션은 `prefers-reduced-motion`을 존중한다 (전역 미디어쿼리 있음, 추가 JS 분기 필요 시 명시).
- 인풋 `font-size`는 16px 이상 (iOS 자동 확대 방지).

## 도메인 규칙

### 지도
- 지도 컴포넌트는 전부 `'use client'` + `dynamic(..., { ssr: false })`.
  SSR 중 `window.naver` 접근 금지.
- SDK 파라미터는 **`ncpKeyId`**. `ncpClientId`는 구버전이며 인증 실패한다.
- 마커 갱신은 **diff**. 전체 `setMap(null)` 후 재생성 금지 (깜빡임).
- 반경 쿼리는 반드시 `st_dwithin`. `st_distance(...) < radius`는 인덱스를 안 탄다.

### 데이터
- 서버 상태는 TanStack Query. `useEffect` + `fetch` 수동 조합 금지.
- zustand는 지도 뷰 상태(center, zoom, radius, selectedId)만. 서버 데이터 넣지 말 것.
- 추천 결과는 **서버가 결정한다.** 클라이언트 랜덤 금지. 애니메이션은 응답 수신 후 연출일 뿐.
- `SUPABASE_SERVICE_ROLE_KEY`, `NAVER_SEARCH_CLIENT_SECRET`은 서버 라우트 전용.
  `NEXT_PUBLIC_` 접두사 붙이지 말 것.

### 하지 말 것
- 네이버 플레이스 리뷰/평점 크롤링 (약관 위반)
- `styletron` / `baseui` 도입
- `any` 타입. 불가피하면 `unknown` + 좁히기
- 빈 상태·에러 상태 없이 화면 완성 처리

## 문구 (UX writing)

- 사내 툴이지만 딱딱하지 않게. 존댓말, 문장부호 최소.
- 버튼은 실제로 일어나는 일을 쓴다. "확인" ✗ → "리뷰 남기기" ✓
- 같은 동작은 플로우 내내 같은 이름. "여기로 갈게요"로 시작했으면 토스트도 같은 어휘.
- 에러는 사과하지 않고 다음 행동을 알려준다.
  "오류가 발생했습니다" ✗ → "맛집을 불러오지 못했어요. 다시 시도해 주세요." ✓
- 빈 상태는 행동 유도. "리뷰가 없습니다" ✗ → "첫 리뷰를 남겨보세요" ✓

## 검증

각 태스크 종료 시:
```bash
pnpm build                                          # 통과 필수
rg -n '#[0-9a-fA-F]{6}' src --glob '!**/globals.css'  # 0건이어야 함
rg -n 'bg-(gray|orange|red|slate|zinc)-' src          # 0건이어야 함
```
P 단계 종료 시 실기기(iOS Safari + Android Chrome) 확인 1회.
