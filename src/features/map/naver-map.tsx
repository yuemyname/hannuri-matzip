"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  DEFAULT_ZOOM,
  FALLBACK_CENTER,
  NAVER_MAP_CLIENT_ID,
  naverMapsSdkUrl,
} from "./config";

type Status = "loading" | "ready" | "no-key" | "load-failed" | "auth-failed";

const MESSAGE: Record<Exclude<Status, "loading" | "ready">, string> = {
  "no-key":
    "지도 키가 없어요. NEXT_PUBLIC_NAVER_MAP_CLIENT_ID를 설정해 주세요.",
  "load-failed": "지도를 불러오지 못했어요. 새로고침해 주세요.",
  // 대부분 NCP 콘솔의 서비스 URL 에 현재 도메인이 안 들어간 경우다 (SPEC §1.1).
  "auth-failed":
    "지도 인증에 실패했어요. NCP 서비스 URL에 이 주소가 있는지 확인해 주세요.",
};

/**
 * 지도 인스턴스는 앱 전체에서 하나만 존재한다 (CLAUDE.md, SHELL.md §4).
 * 이 컴포넌트는 메인에서만 마운트하고, 모달 안에서 새로 만들지 않는다.
 */
export default function NaverMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const [status, setStatus] = useState<Status>(
    NAVER_MAP_CLIENT_ID ? "loading" : "no-key",
  );

  // 인증 실패는 스크립트 onError 로 안 잡힌다. SDK 가 이 전역 함수를 직접 부른다.
  // 스크립트가 실행되기 전에 걸어둬야 놓치지 않는다.
  useEffect(() => {
    window.navermap_authFailure = () => setStatus("auth-failed");
    return () => {
      delete window.navermap_authFailure;
    };
  }, []);

  useEffect(() => {
    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  const initMap = () => {
    // SSR 에서는 여기까지 오지 않는다 — 이 컴포넌트는 ssr: false 로만 마운트된다.
    if (!containerRef.current || mapRef.current) return;
    if (typeof window === "undefined" || !window.naver?.maps) {
      setStatus("load-failed");
      return;
    }

    mapRef.current = new naver.maps.Map(containerRef.current, {
      center: new naver.maps.LatLng(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng),
      zoom: DEFAULT_ZOOM,
      // 반경 Circle·현재위치 마커는 1.3, 맛집 마커는 2.3 에서 올린다.
    });
    setStatus("ready");
  };

  return (
    <div className="relative size-full">
      {NAVER_MAP_CLIENT_ID && (
        <Script
          src={naverMapsSdkUrl(NAVER_MAP_CLIENT_ID)}
          strategy="afterInteractive"
          onReady={initMap}
          onError={() => setStatus("load-failed")}
        />
      )}

      <div ref={containerRef} className="size-full" aria-label="지도" />

      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted p-6">
          {status === "loading" ? (
            <span className="text-caption text-muted-foreground">
              지도 불러오는 중
            </span>
          ) : (
            <p
              role="alert"
              className="max-w-[280px] text-center text-body text-muted-foreground"
            >
              {MESSAGE[status]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
