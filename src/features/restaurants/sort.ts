import type { NearbyRestaurant } from "./api";

// 정렬은 클라이언트에서 한다. 반경 안 결과라 많아야 수십 건이고,
// 서버에 다시 다녀오면 정렬 바꿀 때마다 리스트가 비었다 채워진다.

export const SORTS = {
  distance: "거리순",
  rating: "별점순",
  reviews: "리뷰 많은 순",
} as const;

export type SortKey = keyof typeof SORTS;
export const DEFAULT_SORT: SortKey = "distance";

/**
 * 동점은 항상 가까운 순으로 푼다. 안 그러면 같은 별점끼리 순서가 들쭉날쭉해서
 * 필터를 바꿀 때마다 리스트가 뒤섞인 것처럼 보인다.
 */
export function sortRestaurants(
  list: readonly NearbyRestaurant[],
  key: SortKey,
): NearbyRestaurant[] {
  const byDistance = (a: NearbyRestaurant, b: NearbyRestaurant) =>
    a.distanceM - b.distanceM;

  return [...list].sort((a, b) => {
    if (key === "rating") {
      // 리뷰 0건은 avgRating 이 0 이다. "0점" 이 아니라 "아직 없음" 이므로 맨 뒤로 보낸다.
      const ra = a.reviewCount === 0 ? -1 : a.avgRating;
      const rb = b.reviewCount === 0 ? -1 : b.avgRating;
      return rb - ra || byDistance(a, b);
    }
    if (key === "reviews") {
      return b.reviewCount - a.reviewCount || byDistance(a, b);
    }
    return byDistance(a, b);
  });
}

/** 가격대 1–4. 숫자만 보여주면 뭔지 알 수 없으니 실제 금액대를 적는다 (SPEC §2.1 주석) */
export const PRICE_LABEL: Record<number, string> = {
  1: "~8천",
  2: "~1.2만",
  3: "~2만",
  4: "2만+",
};
