"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_RADIUS } from "./config";

export type LatLng = { lat: number; lng: number };

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
  radius: number;
  /** 선택된 맛집. 2.3 에서 마커 클릭이 채운다 */
  selectedId: string | null;
  setView: (center: LatLng, zoom: number) => void;
  setRadius: (radius: number) => void;
  setSelectedId: (selectedId: string | null) => void;
};

export const useMapView = create<MapViewState>()(
  persist(
    (set) => ({
      center: null,
      zoom: null,
      radius: DEFAULT_RADIUS,
      selectedId: null,
      setView: (center, zoom) => set({ center, zoom }),
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
