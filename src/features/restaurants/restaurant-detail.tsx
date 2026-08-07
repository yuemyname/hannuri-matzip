"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 상세 본문은 지연 로드한다 (WBS 3.1). 메인에서 모달을 열기 전까지는
 * 리뷰 폼·이미지 리사이즈 같은 코드가 번들에 실릴 이유가 없다.
 *
 * 모달과 풀페이지 fallback 이 **이 하나**를 같이 쓴다 — 복붙 금지.
 */
const View = dynamic(
  () => import("./restaurant-detail-view").then((m) => m.RestaurantDetailView),
  {
    loading: () => (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
    ),
  },
);

export function RestaurantDetail({ id }: { id: string }) {
  return <View id={id} />;
}
