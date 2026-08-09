import type { NearbyRestaurant } from "@/features/restaurants/api";

// 마커 아이콘 HTML. 클래스 문자열이라 Tailwind 가 정적으로 읽는다 — 조립하지 않고
// 두 벌을 통째로 적는다. hex 를 박을 필요도 없다.
//
// **선택 배경은 brand-600(`bg-primary`)이다.** brand-500 은 대비 3.5:1 이라
// 텍스트 배경으로 쓰지 않는다 (CLAUDE.md).

const BASE =
  "flex h-6 w-12 items-center justify-center gap-0.5 rounded-chip border text-caption font-medium shadow-marker";

const NORMAL = `${BASE} border-border bg-background text-foreground`;
// 색만 바꾸면 지도 위에서 못 찾는다. 크기와 한 번짜리 튕김을 함께 준다 (WBS 2.5).
// 반복 애니메이션은 쓰지 않는다 — 계속 움직이면 나머지를 읽기 어렵다.
const SELECTED = `${BASE} scale-110 border-transparent bg-primary text-primary-foreground animate-marker-pop`;

/** 마커 한 개의 크기. 좌표 위에 가운데가 오도록 앵커를 잡는 데 쓴다 */
export const MARKER_SIZE = { width: 48, height: 24 };

/** 아이콘을 다시 만들어야 하는지 판단하는 키. 같으면 DOM 을 건드리지 않는다 */
export function markerIconKey(r: NearbyRestaurant, selected: boolean) {
  return `${r.avgRating}|${r.reviewCount}|${selected ? "1" : "0"}`;
}

export function markerIconHtml(r: NearbyRestaurant, selected: boolean) {
  const rated = r.reviewCount > 0;

  // 색만으로 알리지 않는다. 숫자를 함께 둔다 (CLAUDE.md).
  const label = rated
    ? `${r.name}, 별점 ${r.avgRating.toFixed(1)}, 리뷰 ${r.reviewCount}개`
    : `${r.name}, 아직 별점 없음`;

  // 선택되면 별도 currentColor 를 따라간다. 흰 배경일 때만 별 색을 쓴다.
  const star = selected
    ? '<span aria-hidden="true">★</span>'
    : '<span aria-hidden="true" class="text-star">★</span>';

  // 별점이 없을 때 0.0 을 쓰면 "0점" 으로 읽힌다. 그건 다른 뜻이다.
  const value = rated ? r.avgRating.toFixed(1) : "–";

  // 지도 위의 요소지만 키보드로도 닿아야 한다 (CLAUDE.md 접근성).
  return (
    `<button type="button" class="${selected ? SELECTED : NORMAL}" ` +
    `aria-pressed="${selected}" aria-label="${escapeHtml(label)}">` +
    `${star}<span class="tnum">${value}</span></button>`
  );
}

/**
 * 여러 곳이 한 칸에 겹쳤을 때 뜨는 숫자 원.
 *
 * 이름을 안 쓴다 — 대표를 하나 고르면 나머지가 그 뒤에 숨은 것처럼 보이는데,
 * 여기 의미는 "이 근처에 N곳" 이지 "대표는 어디" 가 아니다. 누르면 확대해서 갈라진다.
 */
export function clusterIconHtml(count: number) {
  return (
    `<button type="button" class="${CLUSTER}" ` +
    `aria-label="이 근처 ${count}곳, 확대해서 보기">` +
    `<span class="tnum">${count}</span></button>`
  );
}

/** 숫자 원의 크기. 마커보다 작지 않아야 손가락으로 누를 수 있다 */
export const CLUSTER_SIZE = { width: 36, height: 36 };

const CLUSTER =
  "flex h-9 w-9 items-center justify-center rounded-chip border border-transparent " +
  "bg-primary text-label font-medium text-primary-foreground shadow-marker";

/** 맛집 이름은 사용자가 넣는다. 그대로 붙이면 마커가 주입 지점이 된다. */
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
