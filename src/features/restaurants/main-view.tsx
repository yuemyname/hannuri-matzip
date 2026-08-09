"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPanel } from "@/features/map/map-panel";
import { hasSeenWelcome } from "@/features/onboarding/seen";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { useMapView, useMapViewHydrated } from "@/features/map/map-store";
import { FETCH_LIMIT, MIN_QUERY_ZOOM } from "@/features/map/config";
import { metersBetween } from "@/features/map/geo";
import type { Category } from "@/lib/categories";
import { useCategories } from "@/features/categories/api";
import { useInBounds } from "./use-nearby";
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

/** 펼쳤을 때 뜨는 항목. 셋의 크기를 맞춰 오른쪽 변이 한 줄로 떨어지게 한다 */
const ACTION =
  "inline-flex w-24 shrink-0 items-center justify-center rounded-chip border border-border bg-background px-3 py-2 text-label shadow-pop hover:bg-muted";

const MENU = [
  { href: "/pick", label: "점메추" },
  { href: "/bill", label: "밥값 내기" },
  { href: "/restaurants/new", label: "식당 등록" },
  { href: "/me", label: "MY" },
] as const;

/**
 * 지도 오른쪽 위 액션 버튼 — 평소엔 [+] 하나, 누르면 셋이 펼쳐진다.
 *
 * 메뉴(`role="menu"`)가 아니라 **접었다 펴는 링크 묶음**이다. 세 항목이 전부
 * "다른 화면으로 간다" 라서 명령이 아니라 이동이고, 그래서 그냥 `a` 로 둔다 —
 * 메뉴로 만들면 링크가 `menuitem` 이 되어 스크린리더가 "링크" 라고 안 읽는다.
 *
 * 그래서 Esc·바깥 클릭은 직접 처리한다. 여는 장치가 하나뿐이라 이 정도면 된다.
 */
function MapActions() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Esc 로 닫았으면 포커스를 열었던 버튼으로 되돌린다. 안 그러면
      // 사라진 링크에 포커스가 남아 다음 Tab 이 문서 맨 앞으로 튄다.
      toggleRef.current?.focus();
    };
    // 바깥을 누르면 닫는다. click 이 아니라 pointerdown 이라야 지도를 끌기
    // 시작하는 순간 닫힌다 — click 이면 드래그가 끝날 때까지 메뉴가 떠 있다.
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute top-3 right-3 z-[var(--z-filterbar)] flex flex-col items-end gap-2"
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls="map-actions"
        // 글자가 기호라 이름을 따로 준다. "+" 만으로는 무엇이 열리는지 모른다.
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto inline-flex size-12 items-center justify-center rounded-chip bg-primary text-title leading-none font-medium text-primary-foreground shadow-pop hover:bg-brand-700"
      >
        <span aria-hidden="true">{open ? "✕" : "+"}</span>
      </button>

      {/* 접혀 있을 때는 DOM 에서 아예 뺀다. `hidden` 으로 두면 Tab 이 안 보이는
          링크를 지나간다 — 눈에는 안 보이는데 포커스만 사라진 것처럼 보인다. */}
      {open && (
        <nav
          id="map-actions"
          aria-label="바로가기"
          className="flex flex-col items-end gap-2"
        >
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setOpen(false)}
              className={`${ACTION} pointer-events-auto`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function MainView() {
  useFirstRunWelcome();
  const position = useCurrentPosition();
  const selectedId = useMapView((s) => s.selectedId);
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
  // 칩을 세우는 순서는 DB 가 정한다 (categories.sort_order).
  const categoryList = useCategories();

  // **조회 범위는 화면에 보이는 영역이다.** 반경 원 안만 보여 주면 "여기 뭐 있지"
  // 하고 끌어 본 사람에게 화면 절반이 비어 보인다. 줄을 당겨 넓히면 더 보이고
  // 좁히면 덜 보인다 — 보이는 데까지가 곧 규칙이라 원도 반경 토글도 없앴다.
  const bounds = useMapView((s) => s.bounds);
  const zoom = useMapView((s) => s.zoom);

  // **카테고리를 서버에 넘기지 않는다.** 넘기면 서버가 걸러서 오므로, 안 고른
  // 종류가 화면 안에 몇 곳인지 알 수 없다 — 칩에 개수를 못 붙이고 "없는 종류"도
  // 못 가린다. 화면 안 결과는 많아야 수십 건이라 거르기는 여기서 해도 된다.
  const query = useInBounds(hydrated ? bounds : null, zoom);
  // 너무 넓게 보면 조회를 멈춘다. 그때 직전 결과가 남아 있으면 "확대하면 보여요"
  // 라고 적어 놓고 마커는 떠 있는 꼴이 된다 — 좁혀서 본 자리의 마커다.
  const tooWide = zoom !== null && zoom < MIN_QUERY_ZOOM;

  // 상한보다 한 건 더 받아 온다. 넘쳤으면 잘라서 그리되 **조용히 자르지 않는다** —
  // 화면이 알려 주지 않으면 "이게 전부" 로 읽힌다.
  // (핀 개수 상한은 여기가 아니라 클러스터링이 맡는다. 받은 건 다 그려진다 —
  //  하나씩이 아니라 숫자 원으로 묶여서.)
  const truncated = !tooWide && (query.data?.length ?? 0) > FETCH_LIMIT;

  // 서버가 준 `distance_m` 은 **조회 기준점에서의 거리**다. 지도를 옮기면 그게
  // 화면 한복판 기준이 되어 버려서, 걸어갈 거리를 묻는 사람에게 거짓말이 된다.
  // 카드에 적히는 거리는 언제나 내 위치에서 다시 잰다.
  const me = position.center;
  const all = useMemo(
    () =>
      (tooWide ? [] : (query.data ?? []).slice(0, FETCH_LIMIT)).map((r) => ({
        ...r,
        distanceM: Math.round(metersBetween(me, { lat: r.lat, lng: r.lng })),
      })),
    [query.data, me, tooWide],
  );

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

      {/* 오른쪽 위 = 무엇을 할지. 아래(필터·카드)와 층을 나눈다.
          평소에는 [+] 하나만 떠 있어서 지도를 거의 안 가린다. */}
      <MapActions />

      {/* 지도 아래에 뜨는 것들. 아래에서부터 컨트롤 → 고른 곳 카드 순으로 쌓인다.
          여기도 감싸는 층은 포인터 이벤트를 안 받는다. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-filterbar)] flex flex-col gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
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
            categories={categories}
            onToggleCategory={toggleCategory}
            onClearCategories={clearCategories}
            categoryCounts={categoryCounts}
            allCategories={categoryList.data ?? []}
            count={restaurants.length}
            truncated={truncated}
            // 너무 넓게 보면 조회를 안 한다. 마커가 없는 이유를 화면이 말해야 한다.
            tooWide={tooWide}
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
