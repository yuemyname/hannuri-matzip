"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_RADIUS } from "./config";

export type LatLng = { lat: number; lng: number };

/**
 * 메인 화면을 지도로 볼지 리스트로 볼지 (2026-08-11).
 *
 * 카메라와 같은 성격이라 여기 둔다 — "지금 무엇을 어떻게 보고 있나" 다.
 * 저장하는 이유는 새로고침 때문이다. 지도를 보다 새로고침했는데 리스트로
 * 튕기면 보고 있던 자리를 잃는다. 저장소가 sessionStorage 라 **탭을 새로
 * 열면 다시 리스트**다 — 요청의 "최초에는 리스트뷰" 는 그대로 산다.
 */
export type ViewMode = "list" | "map";

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
  /** 지도로 볼지 리스트로 볼지. 첫 방문은 리스트 (§4.1) */
  view: ViewMode;
  /**
   * "카메라를 여기로 옮겨라" 는 **명령**이다. 상태가 아니라 한 번 쓰고 버린다.
   *
   * 카메라를 실제로 움직이는 건 `MapPanel` 하나뿐인데(지도 인스턴스가 하나라
   * 그래야 한다), 옮기라고 말하고 싶은 쪽은 지도 밖에 있다 — 오른쪽 위
   * [내 위치] 버튼이 그렇다. 그래서 명령만 여기 두고 실행은 MapPanel 이 한다.
   *
   * `nonce` 가 있는 이유: 같은 자리로 두 번 눌러도 통해야 한다. 좌표만 보면
   * 두 번째 클릭이 "값이 안 변했다" 로 묻힌다.
   */
  flyTo: (LatLng & { nonce: number }) | null;
  setView: (center: LatLng, zoom: number, bounds: Bounds | null) => void;
  setRadius: (radius: number) => void;
  setSelectedId: (selectedId: string | null) => void;
  setViewMode: (view: ViewMode) => void;
  requestFlyTo: (to: LatLng) => void;
  clearFlyTo: () => void;
};

export const useMapView = create<MapViewState>()(
  persist(
    (set) => ({
      center: null,
      zoom: null,
      bounds: null,
      radius: DEFAULT_RADIUS,
      selectedId: null,
      view: "list",
      flyTo: null,
      // bounds 를 못 읽었으면 예전 값을 지우지 않는다. 지우면 조회가 멈춘다.
      setView: (center, zoom, bounds) =>
        set(bounds ? { center, zoom, bounds } : { center, zoom }),
      setRadius: (radius) => set({ radius }),
      setSelectedId: (selectedId) => set({ selectedId }),
      setViewMode: (view) => set({ view }),
      requestFlyTo: (to) =>
        set((s) => ({ flyTo: { ...to, nonce: (s.flyTo?.nonce ?? 0) + 1 } })),
      clearFlyTo: () => set({ flyTo: null }),
    }),
    {
      name: "hannuri-matzip:map-view",
      // 탭을 닫으면 잊는다. 모달 URL 을 새로고침해도 같은 탭이면 뷰가 살아남는다.
      storage: createJSONStorage(() => sessionStorage),
      // **flyTo 는 저장하지 않는다.** 명령이라 되살아나면 안 된다 — 새로고침
      // 했더니 지도가 저 혼자 움직이는 꼴이 된다.
      partialize: ({ flyTo: _flyTo, ...rest }) => rest,
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
