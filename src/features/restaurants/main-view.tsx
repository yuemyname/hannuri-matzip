"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPanel } from "@/features/map/map-panel";
import { hasSeenWelcome } from "@/features/onboarding/seen";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { useMapView, useMapViewHydrated } from "@/features/map/map-store";
import type { Category } from "@/lib/categories";
import { useNearby } from "./use-nearby";
import { MapControls } from "./map-controls";
import { RestaurantCard } from "./restaurant-card";
import type { SelectSource } from "./select-source";

/**
 * 메인 셸 — 지도 한 장 + 그 위에 뜨는 플로팅 컨트롤 (SPEC §4.1).
 *
 * **리스트는 없다.** 화면은 지도가 전부고, 반경·카테고리 토글은 그 위에 떠 있다.
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

/** 보조 액션 알약. 주 액션(점메추)만 브랜드색이고 나머지는 흰 알약이다 */
const ACTION =
  "inline-flex shrink-0 items-center rounded-chip border border-border bg-background px-3 py-1.5 text-label shadow-pop hover:bg-muted";

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

  // **카테고리를 서버에 넘기지 않는다.** 넘기면 서버가 걸러서 오므로, 안 고른
  // 종류가 반경 안에 몇 곳인지 알 수 없다 — 칩에 개수를 못 붙이고 "없는 종류"도
  // 못 가린다. 반경 안 결과는 많아야 수십 건이라 거르기는 여기서 해도 된다.
  // (정렬을 클라이언트에서 하기로 한 것과 같은 이유다.)
  const query = useNearby(hydrated ? position.center : null, radius);
  const all = useMemo(() => query.data ?? [], [query.data]);

  // 종류별 개수. 거르기 전 목록에서 세야 "한식 3 / 일식 2" 가 나온다.
  const categoryCounts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const r of all) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, [all]);

  const restaurants = useMemo(
    () =>
      categories.length === 0
        ? all
        : all.filter((r) => categories.includes(r.category)),
    [all, categories],
  );

  const toggleCategory = useCallback((c: Category) => {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }, []);
  const clearCategories = useCallback(() => setCategories([]), []);

  // 고른 곳이 필터 밖으로 나가면 카드도 같이 사라져야 한다.
  const selected = restaurants.find((r) => r.id === selectedId) ?? null;

  return (
    // 지도가 화면을 통째로 쓴다. 컨트롤·카드는 그 위에 떠 있다.
    <main className="relative min-h-0 flex-1">
      {/* **`z-map` 은 값이 0이라도 반드시 있어야 한다.** 네이버 SDK 가 지도 안에
          로고·축척을 z-index 100 언저리로 얹는데, 여기에 z-index 가 없으면
          그것들이 쌓임 맥락을 안 만들고 문서 최상위에서 경쟁해서 모달(z 50)
          위로 뚫고 올라온다 — 안내 팝업 위에 "© NAVER Corp." 가 찍혔다.
          여기서 쌓임 맥락을 만들어 지도의 내부 z-index 를 가둔다. */}
      <div className="absolute inset-0 z-[var(--z-map)]">
        <MapPanel
          position={position}
          restaurants={restaurants}
          selectedId={selectedId}
          selectionSource={source}
          onSelect={handleSelect}
        />
      </div>

      {/* 지도 위에 뜨는 것들. 아래에서부터 컨트롤 → 고른 곳 카드 → 액션 순으로 쌓인다.
          **감싸는 층은 포인터 이벤트를 받지 않는다** — 받으면 지도 아래쪽
          절반을 손가락으로 끌 수 없게 된다. 실제 버튼만 켠다.

          **전부 한 흐름(flex column)에 넣는다.** 액션만 따로 absolute 로 띄웠더니
          마커를 골랐을 때 뜨는 카드와 겹쳐서, 카드 오른쪽이 눌리지 않았다.
          떠 있는 것끼리는 좌표로 피하는 게 아니라 같은 줄에 세워서 피한다. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-filterbar)] flex flex-col gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
          {/* 오른쪽 = 무엇을 할지. 가운데(필터)와 섞지 않는다 — 엄지가 닿는
              자리에 액션을 둔다 (SPEC §4.1). 세로로 쌓으면 화면을 130px 넘게
              먹어서 640px 기기에서 지도가 얼마 안 남는다. 한 줄로 눕힌다.
              아이콘 대신 글자를 쓴다. 앱 전체가 글자 기반이라 여기만 아이콘을
              들이면 "이게 뭐지" 하는 버튼이 생긴다. */}
          <nav
            aria-label="바로가기"
            className="flex items-center justify-end gap-2"
          >
            <Link href="/me" className={`${ACTION} pointer-events-auto`}>
              내 정보
            </Link>
            <Link
              href="/restaurants/new"
              className={`${ACTION} pointer-events-auto`}
            >
              + 등록
            </Link>
            <Link
              href="/pick"
              className="pointer-events-auto inline-flex shrink-0 items-center rounded-chip bg-primary px-5 py-2.5 text-subtitle font-medium text-primary-foreground shadow-pop hover:bg-brand-700"
            >
              점메추
            </Link>
          </nav>

          {selected && (
            <div className="pointer-events-auto flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="self-end rounded-chip border border-border bg-background px-2 py-0.5 text-caption text-muted-foreground shadow-pop hover:bg-muted"
              >
                닫기
              </button>
              <RestaurantCard restaurant={selected} selected />
            </div>
          )}

          <MapControls
            radius={radius}
            radiusReady={hydrated}
            onRadiusChange={setRadius}
            categories={categories}
            onToggleCategory={toggleCategory}
            onClearCategories={clearCategories}
            categoryCounts={categoryCounts}
            count={restaurants.length}
            // placeholderData 로 이전 결과를 들고 있는 동안은 로딩이 아니다.
            // 여기서 isFetching 을 보면 토글을 바꿀 때마다 문구가 번쩍인다.
            isLoading={query.isPending}
            isError={query.isError}
            onRetry={() => void query.refetch()}
          />
        </div>
      </div>
    </main>
  );
}
