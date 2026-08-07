"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  DEFAULT_ZOOM,
  NAVER_MAP_CLIENT_ID,
  naverMapsSdkUrl,
  readToken,
  readTokenNumber,
} from "./config";
import type { MapViewProps } from "./map-view";

type Status = "loading" | "ready" | "no-key" | "load-failed" | "auth-failed";

/** 지도를 움직이는 동안 스토어에 계속 쓰지 않도록 잠깐 모은다 (WBS 1.4 "debounce") */
const SAVE_DEBOUNCE_MS = 300;

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
export default function NaverMap({
  initialCenter,
  initialZoom,
  focus,
  me,
  radius,
  onViewChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const meMarkerRef = useRef<naver.maps.Marker | null>(null);
  const accuracyRef = useRef<naver.maps.Circle | null>(null);
  const radiusRef = useRef<naver.maps.Circle | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // idle 리스너는 지도 생성 시 한 번만 붙는다. 최신 콜백을 ref 로 넘겨준다.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
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
      if (saveTimer.current) clearTimeout(saveTimer.current);
      meMarkerRef.current?.setMap(null);
      accuracyRef.current?.setMap(null);
      radiusRef.current?.setMap(null);
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  // 최초 생성에만 쓴다. 이후 카메라는 focus / radius 가 움직인다.
  const initial = useRef({ center: initialCenter, zoom: initialZoom });

  const initMap = () => {
    // SSR 에서는 여기까지 오지 않는다 — 이 컴포넌트는 ssr: false 로만 마운트된다.
    if (!containerRef.current || mapRef.current) return;
    if (typeof window === "undefined" || !window.naver?.maps) {
      setStatus("load-failed");
      return;
    }

    const map = new naver.maps.Map(containerRef.current, {
      center: new naver.maps.LatLng(
        initial.current.center.lat,
        initial.current.center.lng,
      ),
      zoom: initial.current.zoom ?? DEFAULT_ZOOM,
    });

    // 사용자가 움직인 결과를 스토어에 적는다. idle 은 이동·줌이 끝났을 때만 온다.
    naver.maps.Event.addListener(map, "idle", () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const c = map.getCenter();
        onViewChangeRef.current({ lat: c.y, lng: c.x }, map.getZoom());
      }, SAVE_DEBOUNCE_MS);
    });

    mapRef.current = map;
    setStatus("ready");
  };

  // 반경 Circle 은 지도 준비 후 한 번만 만든다. 이후엔 중심·반지름만 갱신한다.
  const ensureRadiusCircle = (map: naver.maps.Map) => {
    if (radiusRef.current) return radiusRef.current;
    const stroke = readToken("--color-brand-500");
    radiusRef.current = new naver.maps.Circle({
      map,
      center: map.getCenter(),
      radius,
      // 토큰을 못 읽으면 색 옵션을 빼고 SDK 기본값에 맡긴다
      ...(stroke ? { strokeColor: stroke, fillColor: stroke } : {}),
      strokeWeight: 1,
      strokeOpacity: readTokenNumber("--map-circle-stroke-opacity", 0.4),
      fillOpacity: readTokenNumber("--map-circle-fill-opacity", 0.06),
    });
    return radiusRef.current;
  };

  // focus 가 바뀔 때만 옮긴다. 저장된 뷰로 복원한 뒤 위치가 도착했다고 해서
  // 멋대로 튕기면 안 되기 때문에, 옮길지 말지는 MapPanel 이 정한다.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map || !focus) return;
    const at = new naver.maps.LatLng(focus.lat, focus.lng);
    ensureRadiusCircle(map).setCenter(at);
    map.panTo(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, focus]);

  // 반경이 바뀌면 반지름과 줌이 함께 움직인다 (WBS 1.3 DoD).
  // 첫 실행에서 저장된 줌이 있으면 fitBounds 를 건너뛴다 — 복원한 뷰를 덮어쓰지 않으려고.
  const firstRadiusRun = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    const circle = ensureRadiusCircle(map);
    circle.setRadius(radius);

    const skip = firstRadiusRun.current && initial.current.zoom !== null;
    firstRadiusRun.current = false;
    if (!skip) map.fitBounds(circle.getBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, radius]);

  // 내 위치: 파란 점 + accuracy 원 (SPEC §4.1).
  // 삭제 후 재생성이 아니라 위치·반지름만 갱신한다 — 깜빡이지 않게 (CLAUDE.md).
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    if (!me) {
      meMarkerRef.current?.setMap(null);
      accuracyRef.current?.setMap(null);
      return;
    }

    const at = new naver.maps.LatLng(me.lat, me.lng);

    if (!accuracyRef.current) {
      const blue = readToken("--color-my-location");
      accuracyRef.current = new naver.maps.Circle({
        map,
        center: at,
        radius: me.accuracy,
        strokeWeight: 0,
        ...(blue ? { fillColor: blue } : {}),
        fillOpacity: 0.12,
      });
    } else {
      accuracyRef.current.setMap(map);
      accuracyRef.current.setCenter(at);
      accuracyRef.current.setRadius(me.accuracy);
    }

    if (!meMarkerRef.current) {
      meMarkerRef.current = new naver.maps.Marker({
        map,
        position: at,
        title: "내 위치",
        icon: {
          // 클래스 문자열이라 Tailwind 가 그대로 읽는다. hex 를 박지 않아도 된다.
          content:
            '<div class="size-3.5 rounded-chip border-2 border-white bg-my-location shadow-marker"></div>',
          anchor: new naver.maps.Point(7, 7),
        },
        zIndex: 100,
      });
    } else {
      meMarkerRef.current.setMap(map);
      meMarkerRef.current.setPosition(at);
    }
  }, [status, me]);

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
