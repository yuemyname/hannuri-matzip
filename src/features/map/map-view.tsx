"use client";

import dynamic from "next/dynamic";
import type { Coords } from "./use-current-position";
import type { LatLng } from "./map-store";

/**
 * 지도는 SSR 하지 않는다 — 서버에서 window.naver 에 닿으면 안 된다 (SPEC §1.1).
 * `ssr: false` 는 클라이언트 컴포넌트에서만 쓸 수 있어서 이 얇은 래퍼를 둔다.
 * 서버 컴포넌트인 페이지는 이 파일만 import 한다.
 */
const NaverMap = dynamic(() => import("./naver-map"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-muted">
      <span className="text-caption text-muted-foreground">
        지도 불러오는 중
      </span>
    </div>
  ),
});

export type MapViewProps = {
  /** 지도 생성 시 한 번만 쓴다. 이후 카메라는 focus / radius 가 움직인다 */
  initialCenter: LatLng;
  /** 저장된 줌. null 이면 저장된 뷰가 없다는 뜻이라 반경에 맞춰 잡는다 */
  initialZoom: number | null;
  /** 여기로 옮기라는 신호. 값이 바뀔 때만 panTo 한다 */
  focus: LatLng | null;
  me: Coords | null;
  radius: number;
  onViewChange: (center: LatLng, zoom: number) => void;
};

export function MapView(props: MapViewProps) {
  return <NaverMap {...props} />;
}
