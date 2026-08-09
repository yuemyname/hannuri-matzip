"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_RADIUS } from "./config";

export type LatLng = { lat: number; lng: number };

/** 지도 뷰포트. 조회 범위가 반경에서 이걸로 바뀌었다 */
export type Bounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

/**
 * 지도 뷰 상태. 풀페이지 fallback 으로 나갔다 돌아오면 지도가 새로 마운트되는데,
 * 그때 이전 위치·줌으로 되돌리기 위한 것이다 — zustand 를 쓰는 유일한 이유다 (SHELL.md).
 *
 * **서버 데이터를 넣지 말 것** (CLAUDE.md). 맛집 목록·리뷰는 TanStack Query 담당이고
 * 여기는 카메라와 선택 상태만 둔다.
 */
type MapViewState = {
  /** 마지막으로 본 지도 중심. null 이면 아직 저장된 뷰가 없다 (첫 방문) */
  center: LatLng | null;
  zoom: number | null;
  /** 지금 보이는 영역. 맛집 조회는 이걸 쓴다. null 이면 아직 지도가 안 떴다 */
  bounds: Bounds | null;
  /** 점메추 전용 반경. 지도에는 더 이상 안 쓴다 (지도는 보이는 영역이 곧 범위) */
  radius: number;
  /** 선택된 맛집. 2.3 에서 마커 클릭이 채운다 */
  selectedId: string | null;
  setView: (center: LatLng, zoom: number, bounds: Bounds | null) => void;
  setRadius: (radius: number) => void;
  setSelectedId: (selectedId: string | null) => void;
};

export const useMapView = create<MapViewState>()(
  persist(
    (set) => ({
      center: null,
      zoom: null,
      bounds: null,
      radius: DEFAULT_RADIUS,
      selectedId: null,
      // bounds 를 못 읽었으면 예전 값을 지우지 않는다. 지우면 조회가 멈춘다.
      setView: (center, zoom, bounds) =>
        set(bounds ? { center, zoom, bounds } : { center, zoom }),
      setRadius: (radius) => set({ radius }),
      setSelectedId: (selectedId) => set({ selectedId }),
    }),
    {
      name: "hannuri-matzip:map-view",
      // 탭을 닫으면 잊는다. 모달 URL 을 새로고침해도 같은 탭이면 뷰가 살아남는다.
      storage: createJSONStorage(() => sessionStorage),
      // 서버 렌더 결과와 어긋나지 않게 자동 복원을 끄고, 마운트 후 직접 rehydrate 한다.
      // 안 그러면 첫 페인트에서 radius 가 달라져 hydration 경고가 난다.
      skipHydration: true,
    },
  ),
);

/**
 * 저장된 뷰 복원이 끝났는지.
 *
 * `skipHydration` 이라 첫 렌더는 항상 기본값(반경 50m, 줌 없음)이다. 그 상태로
 * 지도를 만들어 버리면 복원 직후 반경이 50 → 200 으로 바뀌면서 `fitBounds` 가
 * 한 번 더 돌아 카메라가 눈에 띄게 튄다. **복원이 끝난 뒤에 지도를 만든다.**
 *
 * sessionStorage 는 동기라 한 프레임이면 끝난다 — 네트워크를 기다리는 게 아니다.
 */
export function useMapViewHydrated() {
  // 서버에서는 항상 false 로 시작한다. sessionStorage 가 없는 환경에서는 zustand 가
  // `persist` API 자체를 안 붙이기 때문에, 여기서 `useMapView.persist` 를 건드리면
  // 프리렌더가 죽는다. 접근은 전부 이펙트 안(=브라우저)에서만 한다.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persist = useMapView.persist;
    if (!persist) {
      // 저장소를 못 쓰는 브라우저(사파리 프라이빗 등). 복원할 게 없으니 그냥 진행한다.
      setHydrated(true);
      return;
    }
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const done = persist.onFinishHydration(() => setHydrated(true));
    void persist.rehydrate();
    return done;
  }, []);

  return hydrated;
}
