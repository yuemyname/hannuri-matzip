"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPanel } from "@/features/map/map-panel";
import { hasSeenWelcome } from "@/features/onboarding/seen";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { useMapView, useMapViewHydrated } from "@/features/map/map-store";
import type { Category } from "@/lib/categories";
import { useNearby } from "./use-nearby";
import { sortRestaurants, DEFAULT_SORT, type SortKey } from "./sort";
import { FilterBar } from "./filter-bar";
import type { SelectSource } from "./select-source";
import { RestaurantList } from "./restaurant-list";

/**
 * 메인 셸 — 지도 + 필터바 + 리스트 (SPEC §4.1).
 *
 * 조회와 필터 상태가 여기 모인다. 지도와 리스트가 **같은 배열**을 보므로
 * 마커 수와 리스트 항목 수가 어긋날 수 없다 (WBS 2.3 DoD).
 *
 * 카테고리·정렬은 zustand 에 넣지 않는다 — 스토어는 지도 뷰 상태만 담는다 (CLAUDE.md).
 * 대신 이 컴포넌트가 들고 있어서 모달을 열고 닫아도 유지된다. 풀페이지 fallback 으로
 * 나갔다 오면 초기화되는데, 반경과 달리 되돌릴 필요가 큰 값은 아니라고 봤다.
 */
/** 손잡이를 이 거리 이상 끌면 단을 바꾼다. 그보다 짧으면 탭으로 보고 클릭이 처리한다 */
const DRAG_SNAP_PX = 40;

/**
 * 손잡이 드래그 → 시트 접기/펼치기.
 * 클릭과 겹치지 않게, 실제로 끌었을 때만 상태를 바꾸고 클릭을 막는다.
 */
function useSheetDrag(setExpanded: (v: boolean) => void) {
  return useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const startY = e.clientY;
      const el = e.currentTarget;
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        if (Math.abs(dy) < DRAG_SNAP_PX) return;
        moved = true;
        setExpanded(dy < 0); // 위로 끌면 목록을 넓힌다
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        // 끌어서 이미 바꿨으면 뒤따르는 click 이 다시 토글하지 않게 한 번 삼킨다
        if (moved) {
          el.addEventListener("click", (c) => c.stopPropagation(), {
            capture: true,
            once: true,
          });
        }
      };

      el.setPointerCapture(e.pointerId);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    [setExpanded],
  );
}

/**
 * 처음 온 사람에게 안내를 한 번 띄운다 (WBS 6.4).
 *
 * `useState` 로 여는 오버레이가 아니라 라우팅이다 — 앱의 다른 화면과 같은 규칙을
 * 쓴다 (SHELL.md). `push` 라서 닫기(`router.back()`)가 메인으로 돌아온다.
 *
 * `localStorage` 는 서버에 없으므로 이펙트 안에서만 읽는다. 여기서 판단하면
 * 하이드레이션 불일치도 안 난다 — 첫 렌더 결과는 양쪽이 같다.
 */
function useFirstRunWelcome() {
  const router = useRouter();
  // 이펙트가 두 번 돌아도(StrictMode·리마운트) 히스토리에 /welcome 이 두 번
  // 쌓이지는 않는다 — 같은 URL 로의 push 는 라우터가 합친다. reactStrictMode 를
  // 켜고 확인했고, 그래서 여기 잠금을 두지 않는다.
  useEffect(() => {
    if (hasSeenWelcome()) return;
    router.push("/welcome");
  }, [router]);
}

export function MainView() {
  useFirstRunWelcome();
  const position = useCurrentPosition();
  const radius = useMapView((s) => s.radius);
  const selectedId = useMapView((s) => s.selectedId);
  const setRadius = useMapView((s) => s.setRadius);
  const setSelectedId = useMapView((s) => s.setSelectedId);

  // 어디서 고른 건지 (WBS 2.5). 출처에 따라 반응이 달라야 한다:
  //   map  → 리스트를 그 카드로 스크롤한다
  //   list → 마커만 강조한다. 스크롤도 지도 이동도 하지 않는다 (내가 보던 자리가 튄다)
  //   null → 밖에서 온 것(점메추 [여기로 갈게요]). 지도를 그리로 옮긴다
  const lastPick = useRef<{ id: string; source: SelectSource } | null>(null);
  const source =
    selectedId && lastPick.current?.id === selectedId
      ? lastPick.current.source
      : null;

  const handleSelect = useCallback(
    (id: string, from: SelectSource) => {
      lastPick.current = { id, source: from };
      setSelectedId(id);
    },
    [setSelectedId],
  );

  // 저장된 반경이 복원되기 전에 조회하면 50m 로 한 번 받고 200m 로 또 받는다.
  const hydrated = useMapViewHydrated();

  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [categories, setCategories] = useState<Category[]>([]);
  // 모바일 드래그 시트. 접힘(지도 40dvh) / 펼침(지도 16dvh) 두 단만 둔다.
  const [expanded, setExpanded] = useState(false);
  const onHandleDown = useSheetDrag(setExpanded);

  // 카테고리는 서버가 거른다 — 반경 밖까지 훑을 이유가 없고 RPC 가 이미 받는다.
  // 정렬은 클라이언트다. 서버에 다시 다녀오면 리스트가 비었다 채워진다.
  const query = useNearby(hydrated ? position.center : null, radius, {
    categories,
  });
  const restaurants = useMemo(
    () => sortRestaurants(query.data ?? [], sort),
    [query.data, sort],
  );

  const toggleCategory = useCallback((c: Category) => {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }, []);
  const clearCategories = useCallback(() => setCategories([]), []);

  return (
    // 데스크톱은 좌 리스트 40% / 우 지도 60% 2단 (SPEC §4.1).
    // 브레이크포인트는 lg 하나만 쓴다 (CLAUDE.md).
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className={`shrink-0 transition-[height] lg:order-2 lg:h-auto lg:w-3/5 lg:shrink ${
          expanded ? "h-[16dvh]" : "h-[40dvh]"
        }`}
      >
        <MapPanel
          position={position}
          restaurants={restaurants}
          selectedId={selectedId}
          selectionSource={source}
          onSelect={handleSelect}
        />
      </div>

      <section className="flex min-h-0 flex-1 flex-col lg:order-1 lg:w-2/5 lg:shrink-0 lg:border-r lg:border-border">
        {/* 시트 손잡이. 드래그로도, 키보드로도 접힌다 (드래그 전용이면 못 쓰는 사람이 생긴다) */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "지도 넓게 보기" : "목록 넓게 보기"}
          onClick={() => setExpanded((v) => !v)}
          onPointerDown={onHandleDown}
          className="flex shrink-0 touch-none justify-center border-b border-border bg-background py-2 lg:hidden"
        >
          <span
            aria-hidden="true"
            className="h-1 w-10 rounded-chip bg-ink-200"
          />
        </button>

        {/* 필터바는 리스트가 스크롤돼도 남아야 한다 */}
        <div className="sticky top-0 z-[var(--z-header)] shrink-0">
          <FilterBar
            radius={radius}
            radiusReady={hydrated}
            onRadiusChange={setRadius}
            sort={sort}
            onSortChange={setSort}
            categories={categories}
            onToggleCategory={toggleCategory}
            onClearCategories={clearCategories}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <RestaurantList
            restaurants={restaurants}
            // placeholderData 로 이전 결과를 들고 있는 동안은 로딩이 아니다.
            // 여기서 isFetching 을 보면 필터를 바꿀 때마다 스켈레톤이 번쩍인다.
            isLoading={query.isPending}
            isError={query.isError}
            onRetry={() => void query.refetch()}
            hasFilters={categories.length > 0}
            onClearFilters={clearCategories}
            selectedId={selectedId}
            // 지도에서 고른 것만 스크롤한다. 카드를 훑을 때마다 리스트가 움직이면
            // 보던 자리가 튄다 (2.5 DoD "스크롤이 튀지 않음").
            scrollIntoView={source === "map"}
            onSelect={handleSelect}
          />
        </div>
      </section>
    </main>
  );
}
