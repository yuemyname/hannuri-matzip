/**
 * 상황 태그 — 점메추가 시간대에 따라 가중치를 다르게 주는 축 (SPEC §3.2).
 *
 * **카테고리와 달리 목록이 코드에 있다.** 카테고리는 "무슨 음식이냐" 라서 얼마든지
 * 늘어나도 되지만, 이건 추천 식의 계수와 1:1로 묶여 있다 — 값이 하나 늘면
 * `pick_restaurant` 의 case 문도 같이 늘어야 한다. DB 표로 빼면 화면에서 추가할 수
 * 있게 되는데, 추가해 봐야 아무 가중치도 안 붙는 죽은 태그가 된다.
 *
 * 마이그레이션의 `restaurants_mood_tags_valid` 제약과 **같은 목록이어야 한다.**
 */
export const MOODS = ["혼밥", "가벼움", "회식", "술"] as const;

export type Mood = (typeof MOODS)[number];

export function isMood(value: unknown): value is Mood {
  return typeof value === "string" && (MOODS as readonly string[]).includes(value);
}

/** 행에서 읽은 배열을 안전하게 좁힌다. 모르는 값이 섞여 오면 버린다 */
export function toMoods(value: unknown): Mood[] {
  return Array.isArray(value) ? value.filter(isMood) : [];
}

/**
 * 이 시간대에 이 태그가 유리한가. 화면이 "왜 이걸 골랐는지" 를 설명하는 데 쓴다.
 * **여기 판단은 pick_restaurant 의 계수와 같은 뜻이어야 한다** — 갈라지면 화면이
 * 거짓말을 한다 (실제로는 안 밀어주는 태그를 "그래서 골랐어요" 라고 적는 식).
 */
export function favoredAt(meal: "lunch" | "dinner", mood: Mood): boolean {
  return meal === "dinner"
    ? mood === "회식" || mood === "가벼움" || mood === "술"
    : mood === "혼밥" || mood === "가벼움";
}
