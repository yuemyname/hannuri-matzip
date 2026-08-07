"use client";

import { useQuery } from "@tanstack/react-query";
import { currentUserId, fetchDetail } from "./detail-api";

export const detailKey = (id: string) => ["restaurant", id] as const;

export function useRestaurantDetail(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => fetchDetail(id),
  });
}

/** 세션은 부트스트랩이 이미 확보한다. 여기서는 id 만 꺼내 쓴다 */
export function useCurrentUserId() {
  return useQuery({
    queryKey: ["session", "user-id"],
    queryFn: currentUserId,
    staleTime: Infinity,
  });
}
