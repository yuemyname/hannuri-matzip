// 카테고리 규칙. **목록 자체는 여기 없다** — DB 의 `categories` 표가 정본이다
// (supabase/migrations/20260809000000_categories_table.sql).
//
// 예전에는 이 파일의 배열이 정본이었고 DB check 제약이 그걸 베껴 갔다. 종류를
// 하나 늘리려면 배포가 필요했다. 지금은 목록이 데이터라, 여기 남은 건
// **어떤 이름이 유효한가**와 **무슨 색으로 보여줄까** 두 가지뿐이다.
//
// 이름 규칙은 DB 제약과 같은 뜻이어야 한다. 갈라지면 폼은 통과시키는데 저장이
// 실패하는 상태가 된다 — 두 곳을 같은 커밋에서 바꾼다.

/** 종류 이름. 이제 고정 목록이 아니라 그냥 문자열이다 */
export type Category = string;

export const CATEGORY_MAX_LEN = 20;

/**
 * 사람이 친 것을 저장할 꼴로 만든다.
 * 앞뒤 공백을 떼고, 낱말 사이 연속 공백은 한 칸으로 줄인다.
 * (탭·개행도 공백으로 친다 — 붙여넣기로 섞여 들어온다.)
 */
export function normalizeCategory(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * 못 쓰는 이름이면 **그 이유를** 돌려준다. 쓸 수 있으면 null.
 *
 * 불린이 아니라 문구인 이유: 부르는 쪽마다 "왜 안 되는지"를 다시 적으면
 * 규칙이 바뀔 때 한 군데를 빠뜨린다. 화면에 그대로 띄울 문장을 여기서 만든다.
 */
export function categoryError(name: string): string | null {
  if (name.length === 0) return "종류를 적어 주세요";
  if (name.length > CATEGORY_MAX_LEN)
    return `${CATEGORY_MAX_LEN}자까지 쓸 수 있어요`;
  // DB 의 categories_name_format 과 같은 규칙이다.
  if (!/^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$/.test(name))
    return "한글과 영문만 쓸 수 있어요";
  return null;
}

/** 행에서 읽은 값이 종류로 쓸 만한가. 파싱할 때 null·빈 문자열을 걸러낸다 */
export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && value.length > 0;
}

/**
 * 네이버가 준 분류("음식점>한식>육류,고기요리")에서 **우리 종류**를 찾는다.
 * 못 찾으면 null — 그때는 사용자가 고른다.
 *
 * **후보는 인자로 받는다.** 목록의 정본은 DB 이고 코드에 다시 적지 않는다
 * (CLAUDE.md). 여기 있는 건 "어떻게 맞춰 볼까" 하는 규칙뿐이라, 나중에 종류가
 * 늘어도 이 함수는 그대로 동작한다.
 *
 * 가장 **긴** 이름을 고른다. 짧은 이름이 긴 이름 안에 들어 있을 때
 * ("한식" ⊂ "한식뷔페") 짧은 쪽이 먼저 걸리면 더 정확한 답을 놓친다.
 */
export function matchCategory(
  naverCategory: string,
  known: readonly Category[],
): Category | null {
  const haystack = naverCategory.replace(/\s+/g, "");
  if (haystack.length === 0) return null;

  let best: Category | null = null;
  for (const c of known) {
    const needle = c.replace(/\s+/g, "");
    if (needle.length === 0 || !haystack.includes(needle)) continue;
    // "음식점" 자체가 종류로 등록돼 있으면 뭐든 다 걸린다. 그건 분류가 아니다.
    if (needle === "음식점") continue;
    if (best === null || needle.length > best.replace(/\s+/g, "").length) {
      best = c;
    }
  }
  return best;
}

/**
 * 네이버 분류에서 **새 종류 이름**을 뽑는다. 못 뽑으면 null.
 *
 * `matchCategory` 가 우리 목록에서 못 찾았을 때 쓴다 — 찾았으면 그게 먼저다.
 * 네이버 분류는 `큰분류>중분류>소분류` 꼴이고 쉼표로 여럿이 묶이기도 한다
 * ("음식점>일식>초밥,롤"). **중분류를 쓴다** — 큰분류("음식점")는 종류가 아니고,
 * 소분류("초밥")는 너무 잘아서 종류가 끝없이 늘어난다.
 *
 * **먹는 것에서만 만든다.** 큰분류가 음식이 아니면 null 이다. "생활,편의>미용실"
 * 같은 게 들어오면 「미용실」 종류가 생기는데, 종류는 지도 필터칩으로 모두에게
 * 보이고 쓰는 맛집이 있으면 지우지도 못한다 — 한 번 새면 치우기 어렵다.
 *
 * 이건 **네이버 분류 체계에 대한 규칙**이지 우리 종류 목록이 아니다. 우리 목록의
 * 정본은 여전히 DB 다 (파일 맨 위 주석).
 */
const NAVER_FOOD_TOP = ["음식점", "카페", "디저트", "술집", "베이커리"];

export function categoryFromNaver(naverCategory: string): Category | null {
  const levels = naverCategory.split(">");
  const top = levels[0] ?? "";
  // 큰분류가 먹는 것인가 ("카페,디저트>카페" 처럼 쉼표로 묶여 오기도 한다)
  if (!NAVER_FOOD_TOP.some((f) => top.includes(f))) return null;

  // **중분류가 없으면 만들지 않는다.** 큰분류만 있는 값("음식점")으로 종류를 만들면
  // 이름이 「음식점」인 종류가 생기는데, 그건 분류가 아니고 `matchCategory` 가
  // 일부러 무시하는 값이라 다음부터 아무것도 안 맞는다.
  const mid = levels[1];
  if (mid === undefined) return null;
  const name = normalizeCategory(mid.split(",")[0] ?? "");
  // 이름 규칙은 DB 제약과 같아야 한다. 못 쓰는 이름이면 만들지 않는다.
  return categoryError(name) === null ? name : null;
}

/**
 * 종류별 칩 색.
 *
 * 목록이 열려 버려서 이름마다 색을 손으로 정해 둘 수 없다. 대신 이름을 숫자로
 * 접어서 토큰 7개 중 하나에 배정한다 — 같은 이름은 언제 어디서 그려도 같은 색이고
 * (지도 칩 / 상세 / 등록 폼이 따로 놀지 않는다), 새 종류도 즉시 색을 갖는다.
 *
 * Tailwind 는 클래스 문자열을 정적으로 읽으므로 조립하지 않고 전부 적어 둔다.
 * 씨앗 7종은 원래 쓰던 색을 그대로 유지한다 — 쓰던 사람 눈에 색이 바뀌면
 * "뭐가 달라졌지" 부터 하게 된다.
 */
const PALETTE = [
  "bg-cat-korean text-white",
  "bg-cat-chinese text-white",
  "bg-cat-japanese text-white",
  "bg-cat-western text-white",
  "bg-cat-snack text-white",
  "bg-cat-cafe text-white",
  "bg-cat-etc text-white",
] as const;

const PINNED: Record<string, (typeof PALETTE)[number]> = {
  한식: PALETTE[0],
  중식: PALETTE[1],
  일식: PALETTE[2],
  양식: PALETTE[3],
  분식: PALETTE[4],
  카페: PALETTE[5],
  기타: PALETTE[6],
};

export function categoryColorClass(name: Category): string {
  const pinned = PINNED[name];
  if (pinned) return pinned;
  // djb2. 암호용이 아니라 "같은 이름 → 같은 칸" 이면 충분하다.
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
