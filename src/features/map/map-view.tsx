"use client";

import dynamic from "next/dynamic";
import type { Coords } from "./use-current-position";

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

export function MapView({
  center,
  me,
  radius,
}: {
  center: { lat: number; lng: number };
  me: Coords | null;
  radius: number;
}) {
  return <NaverMap center={center} me={me} radius={radius} />;
}
