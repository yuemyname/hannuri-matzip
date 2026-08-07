# WBS.md 삽입 블록 — P0 끝(0.4 다음)에 붙여넣기

---

### [ ] 0.5 디자인 토큰 + 기본 컴포넌트
> P1부터 화면을 만들기 시작하므로, **그 전에** 색·타입·간격을 고정한다.
> 이 태스크를 건너뛰면 화면마다 색이 미묘하게 달라지고 나중에 전부 되돌려야 한다.

- Pretendard Variable 로드 (`next/font/local` 또는 CDN, `font-display: swap`)
- `src/app/globals.css` 에 토큰 정의 — 브랜드 스케일, ink 스케일, 타입 스케일,
  radius, shadow, z-index, 지도 상수
- shadcn/ui 초기화 (`pnpm dlx shadcn@latest init`) — Tailwind v4 모드
  - 추가할 컴포넌트만: `button` `input` `dialog` `sheet` `badge` `skeleton`
    `dropdown-menu` `switch` `toast`
  - **전체 추가(`--all`) 금지.** 안 쓰는 컴포넌트가 리뷰 대상이 된다.
- 프로젝트 전용 컴포넌트 3종 (`src/components/`)
  - `<Rating value={4.2} count={12} />` — 채워진 별 + **숫자 병기** (SPEC §7, 색만으로 정보 전달 금지)
  - `<CategoryChip category="한식" selected />` — 토글, 키보드 조작 가능
  - `<Distance meters={340} />` — 1000m 미만은 `340m`, 이상은 `1.2km`, `tabular-nums`
- `/design` 라우트에 토큰·컴포넌트 전수 나열 (개발 전용, 배포 시 `noindex`)

**DoD**
- `/design` 에서 전 토큰과 3종 컴포넌트가 렌더됨
- `rg -n '#[0-9a-fA-F]{6}' src --glob '!globals.css'` 결과 **0건**
- 360px 폭에서 `/design` 레이아웃 안 깨짐
- 키보드 Tab만으로 CategoryChip 토글 가능, 포커스 링 육안 확인

---

## 기존 "하지 말 것"에 추가

- 컴포넌트 파일에 hex / `px` 하드코딩 (반드시 토큰 경유)
- Tailwind 기본 팔레트 직접 사용 (`bg-orange-500`, `text-gray-600` 등)
- `styletron` / `baseui` 도입 — Tailwind v4와 스타일 시스템이 갈라진다
- shadcn 컴포넌트를 `node_modules` 취급 — 복사된 코드이므로 직접 수정해서 쓴다
- 별점을 색으로만 표현 (숫자 병기 필수)

---

## 0.1 스캐폴딩 DoD 수정

기존:
> **DoD**: `pnpm dev` 실행 시 빈 페이지 렌더, `pnpm build` 통과

변경:
> **DoD**: `pnpm dev` 실행 시 빈 페이지 렌더, `pnpm build` 통과,
> `src/app/globals.css` 에 `@import "tailwindcss"` 만 있는 상태 (토큰은 0.5에서 채운다)
