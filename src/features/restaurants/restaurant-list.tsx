"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonClass } from "@/components/ui/button";
import { RestaurantCard } from "./restaurant-card";
import type { SelectSource } from "./select-source";
import type { NearbyRestaurant } from "./api";

/**
 * 맛집 리스트. 로딩·에러·빈 상태를 전부 가진다 —
 * 빈 상태 없이 완성 처리하지 않는다 (CLAUDE.md).
 */
export function RestaurantList({
  restaurants,
  isLoading,
  isError,
  onRetry,
  hasFilters,
  onClearFilters,
  selectedId,
  scrollIntoView,
  onSelect,
}: {
  restaurants: NearbyRestaurant[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** 카테고리 필터가 걸려 있는지. 빈 결과의 원인이 달라서 문구가 갈린다 */
  hasFilters: boolean;
  onClearFilters: () => void;
  selectedId: string | null;
  /** 지도에서 고른 경우에만 true. 리스트 안에서 고른 걸 스크롤하면 보던 자리가 튄다 */
  scrollIntoView: boolean;
  onSelect: (id: string, source: SelectSource) => void;
}) {
  const items = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (!scrollIntoView || !selectedId) return;
    // block:"nearest" — 이미 보이면 안 움직인다. 화면 가운데로 끌어오면
    // 마커를 누를 때마다 리스트가 크게 뛴다 (2.5 DoD "스크롤이 튀지 않음").
    items.current.get(selectedId)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [scrollIntoView, selectedId]);

  if (isError) {
    return (
      <Empty
        title="맛집을 불러오지 못했어요"
        action={<Button onClick={onRetry}>다시 시도</Button>}
      />
    );
  }

  if (isLoading) {
    return (
      <ul
        className="flex flex-col gap-2 p-3"
        aria-busy="true"
        aria-label="불러오는 중"
      >
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex flex-col gap-2 rounded-lg border border-border p-3"
          >
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </li>
        ))}
      </ul>
    );
  }

  if (restaurants.length === 0) {
    // 원인에 맞는 다음 행동을 준다. 필터 때문인지 정말 없는 건지가 다르다.
    return hasFilters ? (
      <Empty
        title="이 조건에 맞는 곳이 없어요"
        action={
          <Button variant="outline" onClick={onClearFilters}>
            카테고리 전체 보기
          </Button>
        }
      />
    ) : (
      <Empty
        title="이 반경에는 아직 등록된 곳이 없어요"
        hint="반경을 넓히거나 새로 등록해 보세요"
        action={
          <Link href="/restaurants/new" className={buttonClass()}>
            맛집 등록하기
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2 p-3">
      {restaurants.map((r) => (
        <li
          key={r.id}
          ref={(el) => {
            if (el) items.current.set(r.id, el);
            else items.current.delete(r.id);
          }}
        >
          <RestaurantCard
            restaurant={r}
            selected={r.id === selectedId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <div className="flex flex-col gap-1">
        <p className="text-body">{title}</p>
        {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
