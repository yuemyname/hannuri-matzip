"use client";

import { useQuery } from "@tanstack/react-query";
import type { PlaceCandidate } from "@/lib/naver/local-search";

export type { PlaceCandidate };

/** 검색이 왜 안 됐는지 화면이 구분해야 해서 상태를 함께 들고 다닌다 */
export type PlaceSearchResult = {
  places: PlaceCandidate[];
  /** 키가 없거나 API 가 막혔을 때. 수동 입력 경로를 안내한다 */
  error: string | null;
};

async function search(query: string): Promise<PlaceSearchResult> {
  const res = await fetch("/api/places/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const body: unknown = await res.json().catch(() => null);
  const get = (k: string) =>
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)[k]
      : undefined;

  if (!res.ok) {
    const error = get("error");
    // 검색 실패가 등록 실패는 아니다. 빈 목록 + 안내로 넘기고 수동 입력을 열어둔다.
    return {
      places: [],
      error: typeof error === "string" ? error : "검색하지 못했어요",
    };
  }

  const places = get("places");
  return {
    places: Array.isArray(places) ? (places as PlaceCandidate[]) : [],
    error: null,
  };
}

/**
 * 상호 검색. 두 글자 미만이면 아예 부르지 않는다 — 쿼터가 하루 단위라 아낀다.
 * 입력 디바운스는 호출부가 한다 (타이핑마다 부르면 안 된다).
 */
export function usePlaceSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["places", "search", trimmed],
    queryFn: () => search(trimmed),
    enabled: trimmed.length >= 2,
    // 같은 상호를 다시 치는 일이 잦다. 서버도 캐시하지만 여기서 한 번 더 막는다.
    staleTime: 5 * 60_000,
    retry: false,
  });
}
