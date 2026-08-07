"use client";

import Link from "next/link";
import { Rating } from "@/components/rating";
import { Distance } from "@/components/distance";
import { PRICE_LABEL } from "./sort";
import type { NearbyRestaurant } from "./api";

/**
 * 맛집 카드 — 이름 / 카테고리 · 거리 / 별점 / 가격대 / 사내 메모 1줄 (SPEC §4.1).
 *
 * 카드 전체가 상세로 가는 링크다. `div` + `onClick` 이 아니라 `Link` 라서
 * Tab 으로 닿고 Enter 로 열리며, 새 탭으로도 열린다 (CLAUDE.md 접근성).
 * 그림자 대신 border 1px 이 기본이다.
 */
export function RestaurantCard({
  restaurant: r,
  selected = false,
  onSelect,
}: {
  restaurant: NearbyRestaurant;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const price = r.priceRange === null ? null : PRICE_LABEL[r.priceRange];

  return (
    <Link
      href={`/restaurants/${r.id}`}
      onFocus={() => onSelect?.(r.id)}
      onPointerEnter={() => onSelect?.(r.id)}
      // 선택을 색으로만 알리지 않는다. 테두리 굵기도 함께 바뀐다.
      className={`flex flex-col gap-1.5 rounded-lg border bg-background p-3 transition-colors ${
        selected
          ? "border-brand-600 bg-accent"
          : "border-border hover:bg-accent"
      }`}
      aria-current={selected ? "true" : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-subtitle">{r.name}</span>
        <Distance meters={r.distanceM} />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-caption text-muted-foreground">{r.category}</span>
        {price && (
          <>
            <Dot />
            <span className="tnum text-caption text-muted-foreground">
              {price}
            </span>
          </>
        )}
      </div>

      <Rating value={r.avgRating} count={r.reviewCount} />

      {r.memo && (
        // 사내 팁. 한 줄만 보여주고 나머지는 상세에서 본다.
        <p className="truncate text-caption text-muted-foreground">{r.memo}</p>
      )}
    </Link>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-caption text-muted-foreground">
      ·
    </span>
  );
}
