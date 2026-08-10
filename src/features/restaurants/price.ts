/** 가격대 1–4. 숫자만 보여주면 뭔지 알 수 없으니 실제 금액대를 적는다 (SPEC §2.1 주석) */
export const PRICE_LABEL: Record<number, string> = {
  1: "~8천",
  2: "~1.2만",
  3: "~2만",
  4: "2만+",
};

/**
 * 이 시간대에 이 가격대가 유리한가. 유리하면 결과 카드에 적을 말을, 아니면 null.
 *
 * 점메추는 태그가 없어도 가격대로 점심·저녁을 가른다 (pick_restaurant 의 `price_fit`).
 * **기준은 그 식과 같아야 한다** — 2.5 를 넘으면 저녁 쪽, 못 미치면 점심 쪽이다.
 * 갈라지면 화면이 "그래서 골랐어요" 라고 거짓말을 한다.
 *
 * 딱 걸치는 값은 없다. price_range 는 정수라 2.5 위아래로만 떨어진다.
 */
export function priceReasonAt(
  meal: "lunch" | "dinner",
  priceRange: number | null,
): string | null {
  if (priceRange === null) return null;
  const forDinner = priceRange > 2.5;
  if (meal === "dinner") return forDinner ? "든든한 한 끼" : null;
  return forDinner ? null : "부담 없는 가격";
}
