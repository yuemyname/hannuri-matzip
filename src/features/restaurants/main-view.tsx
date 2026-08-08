"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPanel } from "@/features/map/map-panel";
import { hasSeenWelcome } from "@/features/onboarding/seen";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { useMapView, useMapViewHydrated } from "@/features/map/map-store";
import type { Category } from "@/lib/categories";
import { useNearby } from "./use-nearby";
import { FilterBar } from "./filter-bar";
import { RestaurantCard } from "./restaurant-card";
import type { SelectSource } from "./select-source";

/**
 * 메인 셸 — 지도 + 하단 컨트롤 바 (SPEC §4.1).
 *
 * **리스트는 없다.** 화면은 지도가 전부고, 아래에 반경·카테고리 토글만 둔다.
 * 토글을 바꾸면 조회 조건이 바뀌고, 마커는 그 결과 배열을 그대로 그린다 —
 * 그래서 "고른 종류만 마커로 보인다"가 별도 필터 없이 성립한다.
 *
 * 리스트가 없어진 대신, 마커를 고르면 그 한 곳만 카드로 지도 위에 띄운다.
 * 카드가 없으면 지도에서 상세로 갈 길이 아예 사라진다.
 *
 * 카테고리는 zustand 에 넣지 않는다 — 스토어는 지도 뷰 상태만 담는다 (CLAUDE.md).
 * 대신 이 컴포넌트가 들고 있어서 모달을 열고 닫아도 유지된다.
 */

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
  //   map  → 마커만 강조한다. 지도는 가만히 둔다 (방금 누른 것으로 화면이 튄다)
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

  // 저장된 반경이 복원되기 전에 조회하면 기본값으로 한 번 받고 또 받는다.
  const hydrated = useMapViewHydrated();

  const [categories, setCategories] = useState<Category[]>([]);

  // 카테고리는 서버가 거른다 — 반경 밖까지 훑을 이유가 없고 RPC 가 이미 받는다.
  const query = useNearby(hydrated ? position.center : null, radius, {
    categories,
  });
  const restaurants = useMemo(() => query.data ?? [], [query.data]);

  const toggleCategory = useCallback((c: Category) => {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }, []);
  const clearCategories = useCallback(() => setCategories([]), []);

  // 고른 곳이 필터 밖으로 나가면 카드도 같이 사라져야 한다.
  const selected = restaurants.find((r) => r.id === selectedId) ?? null;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {/* 지도가 남은 높이를 전부 가져간다. 데스크톱도 같다 — 좌측 리스트 단을 없앴다 */}
      <div className="relative min-h-0 flex-1">
        <MapPanel
          position={position}
          restaurants={restaurants}
          selectedId={selectedId}
          selectionSource={source}
          onSelect={handleSelect}
        />

        {/* 고른 한 곳만 지도 위에 띄운다. 컨트롤 바 바로 위에 겹치되,
            바깥은 클릭을 통과시켜 지도를 계속 만질 수 있게 둔다. */}
        {selected && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
            <div className="pointer-events-auto mx-auto flex max-w-[560px] flex-col gap-1">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="self-end rounded-chip bg-background/90 px-2 py-0.5 text-caption text-muted-foreground shadow-pop hover:bg-muted"
              >
                닫기
              </button>
              <RestaurantCard restaurant={selected} selected />
            </div>
          </div>
        )}
      </div>

      <FilterBar
        radius={radius}
        radiusReady={hydrated}
        onRadiusChange={setRadius}
        categories={categories}
        onToggleCategory={toggleCategory}
        onClearCategories={clearCategories}
        count={restaurants.length}
        // placeholderData 로 이전 결과를 들고 있는 동안은 로딩이 아니다.
        // 여기서 isFetching 을 보면 토글을 바꿀 때마다 문구가 번쩍인다.
        isLoading={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />
    </main>
  );
}
