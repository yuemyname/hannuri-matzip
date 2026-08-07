"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Category } from "@/lib/categories";
import type { LatLng } from "@/features/map/map-store";
import { fetchNearby, type NearbyRestaurant } from "./api";

/**
 * 좌표를 그대로 키에 넣으면 지도를 1px 만 움직여도 다른 질의가 된다.
 * 5자리면 약 1m 단위다 — 반경 30m 짜리 앱에는 이 정도가 한계다.
 */
const KEY_PRECISION = 5;
const round = (n: number) => Number(n.toFixed(KEY_PRECISION));

export type NearbyFilters = {
  categories?: readonly Category[];
  minRating?: number;
};

/**
 * 반경 안의 맛집. 서버 상태는 전부 여기를 지난다 (CLAUDE.md).
 *
 * `anchor` 는 지도 중심이 아니라 **반경의 기준점**이다. 지도를 끌어도 검색 기준은
 * 내 위치(또는 사무실 폴백)에 머문다 — 반경 원이 그려진 곳과 결과가 어긋나면 안 된다.
 */
export function useNearby(
  anchor: LatLng | null,
  radiusM: number,
  filters: NearbyFilters = {},
) {
  const { categories, minRating } = filters;

  return useQuery<NearbyRestaurant[]>({
    queryKey: [
      "restaurants",
      "nearby",
      anchor ? round(anchor.lat) : null,
      anchor ? round(anchor.lng) : null,
      radiusM,
      categories?.length ? [...categories].sort() : null,
      minRating ?? null,
    ],
    enabled: anchor !== null,
    queryFn: () =>
      fetchNearby({
        lat: anchor!.lat,
        lng: anchor!.lng,
        radiusM,
        categories,
        minRating,
      }),
    // 반경·필터를 바꾸는 동안 이전 결과를 들고 있는다. 이게 없으면 매번 빈 배열을
    // 거쳐 가면서 마커가 전부 사라졌다 다시 생긴다 — WBS 2.3 의 "깜빡임 없음" 이 이것이다.
    placeholderData: keepPreviousData,
  });
}
