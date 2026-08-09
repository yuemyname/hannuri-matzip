# SHELL.md — 단일 화면 셸 아키텍처

> `SPEC.md §4 화면 정의`를 대체한다. 화면 내용(무엇을 보여주는가)은 SPEC 그대로,
> **어떻게 띄우는가**를 여기서 정한다.

## 0. 결정

메인 화면(지도 + 그 위에 떠 있는 컨트롤)은 앱이 살아있는 동안 **언마운트되지 않는다.**
나머지 화면은 그 위에 모달로 뜬다.

이유:
- 지도 재초기화가 비싸다. 상세 보고 돌아올 때마다 지도가 깜빡이고 뷰가 리셋되면
  "매일 점심때 여는 앱"으로 안 쓰인다.
- 맛집 상세는 사내 슬랙에 링크로 공유된다 → URL은 반드시 살아야 한다.

이 둘을 동시에 만족시키는 건 App Router의 **Intercepting + Parallel Routes** 하나뿐이다.
`useState` 모달은 URL이 없어서 탈락, 풀페이지 라우팅은 지도가 죽어서 탈락.

### 0.0 뒤집힌 결정 — 주소창 진입은 전부 메인으로 (2026-08-09)

위의 "URL은 반드시 살아야 한다"를 **사용자가 알고 뒤집었다.** 하위 화면을 주소창으로
열면(새로고침·슬랙 링크·북마크) 지도 없는 풀페이지가 덩그러니 뜨는 게 어색하다는
이유다. `src/middleware.ts` 가 문서 요청(`Sec-Fetch-Dest: document`)을 전부 `/` 로
돌린다. 그래서:

- **슬랙에 공유한 맛집 링크는 상세로 열리지 않는다.** 메인만 뜬다.
- 풀페이지 fallback 은 화면으로는 아무도 못 본다. 그래도 **파일은 남긴다** —
  인터셉트 라우트(`@modal/(.)…`)가 가로챌 대상이라 지우면 모달이 안 열린다.
- 테스트도 `goto("/pick")` 같은 지름길을 못 쓴다. 메인에서 눌러 들어가야 한다.

되돌릴 때는 `src/middleware.ts` 하나만 지우면 된다. 다른 곳에 흔적을 안 남겼다.

### 0.1 예외 — 관리자 화면 (`/admin`)

모달이 아니다. 여기서 하는 일(남의 리뷰 고치기, 맛집 지우기)은 점심 고르기와
성격이 다르고 뒤에 지도가 살아 있을 이유도 없다. **인터셉트 라우트 짝이 없는
유일한 화면**이고, 위의 "주소창 진입은 메인으로" 규칙에서도 빠져 있다 —
주소창이 여기 오는 유일한 길이다.

관문은 **공용 비밀번호 하나**다. 이 앱에는 신원이 없어서(SPEC §2.4) "누가
관리자인가" 를 물을 데가 없다. 비밀번호는 서버에만 있고(`ADMIN_PASSWORD`),
통과하면 12시간짜리 httpOnly 쿠키를 받는다. 쿠키에는 비밀번호가 아니라
**만료 시각과 그 서명**만 들어간다.

쓰기는 전부 `/api/admin/*` 서버 라우트를 지난다. RLS 는 작성자 본인만
허용하고 카테고리는 정책이 아예 없어서, 관리자는 정책 안에서는 방법이 없다.
대신 `service_role` 키를 서버에만 두고 **모든 라우트가 첫 줄에서 `guard()`** 를
부른다 — 안 지나는 경로가 하나라도 생기면 그게 곧 구멍이다.

## 1. 라우트 구조

```
src/app/
  layout.tsx                      # 헤더 + @modal 슬롯 렌더
  page.tsx                        # 메인 — 지도 한 장 + 플로팅 컨트롤
  @modal/
    default.tsx                   # export default function () { return null }
    (.)pick/page.tsx              # 점메추
    (.)restaurants/new/page.tsx   # 등록
    (.)restaurants/[id]/page.tsx  # 상세
    (.)me/page.tsx                # 마이
    (.)bill/page.tsx              # 밥값 내기
    (.)welcome/page.tsx           # 첫 사용자 안내 3스텝
  pick/page.tsx                   # ↓ 아래 4개는 풀페이지 fallback
  restaurants/new/page.tsx        #   직접 진입 / 새로고침 / 슬랙 링크 클릭 시
  restaurants/[id]/page.tsx
  me/page.tsx
  bill/page.tsx
  welcome/page.tsx
```

로그인 화면이 없으므로(익명 세션) 풀페이지는 fallback 6개뿐이다.
관리자 화면(`/admin`)만 예외로 인터셉트 짝이 없다 (§0.1).

`(.)` = 같은 레벨 인터셉트. `@modal/default.tsx`가 없으면 새로고침 시 404가 난다.

**내용은 한 번만 쓴다.** `features/*/` 아래 뷰 컴포넌트를 만들고,
인터셉트 라우트와 fallback 라우트가 둘 다 그걸 가져다 쓴다. 복붙 금지.

```tsx
// @modal/(.)restaurants/[id]/page.tsx
export default async function Page({ params }) {
  return <Modal><RestaurantDetail id={(await params).id} /></Modal>;
}
// restaurants/[id]/page.tsx
export default async function Page({ params }) {
  return <PageShell><RestaurantDetail id={(await params).id} /></PageShell>;
}
```

## 2. 모달 표현

| | 모바일 (<1024px) | 데스크톱 (≥1024px) |
|---|---|---|
| 형태 | 하단에서 올라오는 시트 | 중앙 다이얼로그 |
| 높이 | `92dvh` (상단에 배경 지도 노출) | `max-h-[85vh]` |
| 폭 | 100% | `max-w-[560px]` |
| 닫기 | 아래로 드래그 / 배경 탭 / 좌상단 X | Esc / 배경 클릭 / X |
| radius | 상단만 `rounded-t-xl` | `rounded-lg` |

- `100vh` 금지. iOS Safari 주소창 때문에 잘린다. **`dvh`를 쓴다.**
- 하단 여백은 `pb-[env(safe-area-inset-bottom)]`.
- shadcn `Sheet`(모바일) / `Dialog`(데스크톱)를 하나의 `<Modal>` 래퍼로 감싸고,
  분기는 그 안에서만 한다. 호출부는 분기를 몰라야 한다.

## 3. 동작 규칙

**닫기 = `router.back()`**
- 안드로이드 하드웨어 백, iOS 스와이프 백이 자동으로 동작한다.
- `router.push('/')` 로 닫지 말 것. 히스토리가 쌓여서 뒤로가기가 이상해진다.

**스택 1단**
- 모달 위 모달 금지. 상세 → 리뷰 쓰기는 **같은 모달 안의 뷰 전환**으로 처리한다.
- 예외: 파괴적 동작 확인(리뷰 삭제)은 `AlertDialog` 허용.

**배경 상태**
- 리스트 드래그 시트는 없다 (2026-08-08 제거, SPEC §4.1). 메인은 지도 한 장이다.
- 배경 지도는 계속 렌더되지만 **인터랙션은 막는다** (`inert` 또는 pointer-events-none).
- body 스크롤 락은 Radix가 처리한다. 직접 `overflow:hidden` 붙이지 말 것.

**지도 뷰 상태 복원**
- 풀페이지 fallback으로 진입했다가 메인으로 돌아오면 지도가 새로 마운트된다.
- 그래서 `center / zoom / radius / selectedId`는 zustand에 두고, 메인 마운트 시 복원한다.
  이게 zustand를 쓰는 유일한 이유다.

**번들**
- 모달 내용은 `dynamic()` 지연 로드. 메인 초기 번들에 상세/등록/추천 코드가 들어가면
  SPEC §6의 "3G 3초" 예산이 깨진다.

**접근성**
- Radix가 focus trap / `aria-modal` / Esc / 포커스 복귀를 처리한다. 직접 구현 금지.
- 모달 열릴 때 첫 포커스는 제목(`tabIndex={-1}`), 닫으면 트리거 버튼으로 복귀.

## 4. 등록 화면의 예외 ⚠️

`/restaurants/new`는 **지도 핀 미세조정이 필수**다(SPEC §4.4-3).
모달 안에 두 번째 지도를 만들면 안 된다 — 인스턴스 2개는 메모리·성능 양쪽에서 문제고,
NCP 요청도 두 배가 된다.

대신 **핀 조정 단계에서만 모달을 하단으로 내리고, 배경의 메인 지도를 그대로 쓴다.**

```
[1] 이름 검색 → 결과 선택        모달 92dvh
[2] 핀 미세조정                  모달 → 하단 220px로 축소,
                                 배경 지도 활성화, 중앙 고정 핀 표시,
                                 지도를 움직여 위치를 맞춤
[3] 카테고리·가격·메모·대표메뉴    모달 92dvh 복귀
```

핀 조정 중 배경 지도는 `pointer-events-auto`로 되돌리고, 지도 이동이 끝나면
`map.getCenter()`를 폼 상태에 반영한다. 마커를 끄는 게 아니라 **지도를 움직인다** —
모바일에서 작은 핀을 손가락으로 끄는 것보다 정확하다.

## 5. WBS 반영

### 0.1 스캐폴딩에 추가
- `@modal` 슬롯 + `default.tsx` 포함한 라우트 골격 생성
- **DoD**: `/pick` 직접 진입 시 풀페이지 렌더, 메인에서 클릭 시 모달 렌더

### 새 태스크 — [ ] 0.6 셸 + 모달 인프라 (0.5 다음)
- `layout.tsx` — 헤더 + `@modal` 슬롯
- `<Modal>` 래퍼 — 모바일 Sheet / 데스크톱 Dialog 분기, `router.back()` 닫기
- `<PageShell>` 래퍼 — 풀페이지 fallback용 (뒤로가기 헤더 포함)
- `@modal/default.tsx`
- 더미 모달 1개로 전 경로 검증
- **DoD**
  - 메인 → 모달 열기 → 뒤로가기 → 모달 닫히고 **지도 뷰 유지**(줌·중심 그대로)
  - 모달 URL 새로고침 → 풀페이지로 정상 렌더
  - 모달 URL을 복사해 새 탭에 붙여넣기 → 정상 진입
  - iOS Safari에서 주소창 노출/숨김 시 모달 하단이 잘리지 않음
  - Esc / 배경 탭 / 아래로 드래그 세 경로 모두 닫힘

### 기존 태스크 수정
- **3.1 상세 페이지** → 모달 + fallback 두 경로. 내용 컴포넌트는 하나.
- **3.2 리뷰 작성** → 별도 모달 아님. 상세 모달 내부 뷰 전환.
- **4.2 `/pick` 화면** → 모달.
- **5.2 등록 폼** → 모달. §4의 3단계 핀 조정 방식 적용.
- **5.4 `/me`** → 모달.

### "하지 말 것"에 추가
- `useState`로 여는 모달 (URL 없는 모달)
- 모달 위 모달 (AlertDialog 제외)
- 모달 안에서 `new naver.maps.Map()` 호출
- `100vh` 사용 (→ `dvh`)
- 인터셉트 라우트와 fallback에 같은 UI를 복붙
