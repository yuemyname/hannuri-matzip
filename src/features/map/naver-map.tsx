"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  DEFAULT_ZOOM,
  FALLBACK_BOUNDS_SPAN_DEG,
  NAVER_MAP_CLIENT_ID,
  naverMapsSdkUrl,
  readToken,
} from "./config";
import {
  MARKER_SIZE,
  markerIconHtml,
  markerIconKey,
} from "./restaurant-marker-icon";
import type { MapViewProps } from "./map-view";

type Status = "loading" | "ready" | "no-key" | "load-failed" | "auth-failed";

/** 지도를 움직이는 동안 스토어에 계속 쓰지 않도록 잠깐 모은다 (WBS 1.4 "debounce") */
const SAVE_DEBOUNCE_MS = 300;

/** 좌표 위에 배지 가운데가 오도록 앵커를 잡는다 */
function icon(
  r: Parameters<typeof markerIconHtml>[0],
  selected: boolean,
): naver.maps.HtmlIcon {
  return {
    content: markerIconHtml(r, selected),
    anchor: new naver.maps.Point(MARKER_SIZE.width / 2, MARKER_SIZE.height / 2),
  };
}

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
  restaurants,
  selectedId,
  onSelect,
  onViewChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const meMarkerRef = useRef<naver.maps.Marker | null>(null);
  const accuracyRef = useRef<naver.maps.Circle | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 맛집 마커. 지우고 다시 만들지 않고 이 맵을 diff 로 맞춘다 (CLAUDE.md).
  const markersRef = useRef(
    new Map<string, { marker: naver.maps.Marker; iconKey: string }>(),
  );

  // idle 리스너는 지도 생성 시 한 번만 붙는다. 최신 콜백을 ref 로 넘겨준다.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  /** 지금 카메라를 스토어로 올린다. bounds 가 곧 조회 범위다 */
  const report = (map: naver.maps.Map) => {
    const c = map.getCenter();
    // getBounds() 의 선언 타입은 PointBounds 와의 합집합이라 좁혀서 쓴다.
    const bb = map.getBounds() as naver.maps.LatLngBounds;
    const sw = bb?.getSW?.();
    const ne = bb?.getNE?.();
    onViewChangeRef.current(
      { lat: c.y, lng: c.x },
      map.getZoom(),
      sw && ne ? { minLat: sw.y, minLng: sw.x, maxLat: ne.y, maxLng: ne.x } : null,
    );
  };
  // 마커 클릭 리스너도 마커마다 한 번만 붙는다. 같은 이유로 ref 를 거친다.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
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
    // ref 는 언마운트 시점에 바뀌어 있을 수 있다. 컨테이너 자체는 한 번만 만들어지므로
    // 여기서 붙잡아 두고 정리 때 그걸 쓴다.
    const markers = markersRef.current;
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      meMarkerRef.current?.setMap(null);
      accuracyRef.current?.setMap(null);
      for (const { marker } of markers.values()) {
        naver.maps.Event.clearInstanceListeners(marker);
        marker.setMap(null);
      }
      markers.clear();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  // 최초 생성에만 쓴다. 이후 카메라는 focus 가 움직인다.
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
      saveTimer.current = setTimeout(() => report(map), SAVE_DEBOUNCE_MS);
    });

    // **첫 조회를 idle 에 맡기지 않는다.** 조회 범위가 곧 화면이라 bounds 가
    // 없으면 아무것도 안 뜬다. SDK 가 최초 idle 을 언제 쏘는지에 화면이 비고
    // 안 비고가 갈리면 안 되므로, 만들자마자 한 번 직접 올린다.
    report(map);

    mapRef.current = map;
    setStatus("ready");
  };

  // **지도를 못 띄워도 조회는 나간다.** 조회 범위가 지도에서만 오면 SDK 가
  // 안 뜨는 순간 목록까지 같이 사라진다 — 지도가 죽었다고 맛집까지 못 볼 이유는 없다.
  // 처음 중심 둘레로 기본 넓이의 상자를 만들어 대신 올린다.
  useEffect(() => {
    if (status === "loading" || status === "ready") return;
    const c = initial.current.center;
    const d = FALLBACK_BOUNDS_SPAN_DEG;
    onViewChangeRef.current(c, initial.current.zoom ?? DEFAULT_ZOOM, {
      minLat: c.lat - d,
      minLng: c.lng - d,
      maxLat: c.lat + d,
      maxLng: c.lng + d,
    });
  }, [status]);

  // focus 가 바뀔 때만 옮긴다. 저장된 뷰로 복원한 뒤 위치가 도착했다고 해서
  // 멋대로 튕기면 안 되기 때문에, 옮길지 말지는 MapPanel 이 정한다.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map || !focus) return;
    map.panTo(new naver.maps.LatLng(focus.lat, focus.lng));
  }, [status, focus]);

  // 조회 범위가 곧 화면이라 반경 원은 그리지 않는다. 원을 두면 "원 밖인데
  // 마커가 있다" 가 되어 원이 무슨 뜻인지 헷갈린다 (2026-08-09 요청).

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

  // 시트를 접었다 펴면 지도 컨테이너 높이가 바뀐다. SDK 가 스스로 못 따라오는
  // 경우가 있어 리사이즈를 알려준다.
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (status !== "ready" || !map || !el) return;
    if (typeof ResizeObserver === "undefined") return;
    // 타입에는 있지만 SDK 버전에 따라 없을 수 있다. ResizeObserver 콜백에서 던지면
    // 이후 리사이즈가 전부 죽는다.
    const ro = new ResizeObserver(() => {
      if (typeof map.refresh === "function") map.refresh();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  // 맛집 마커 — diff 갱신. 전부 setMap(null) 후 재생성하면 필터를 바꿀 때마다
  // 지도가 통째로 깜빡인다 (CLAUDE.md, WBS 2.3 DoD).
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    const alive = new Set(restaurants.map((r) => r.id));

    // 1) 사라진 것만 지운다
    for (const [id, entry] of markersRef.current) {
      if (alive.has(id)) continue;
      naver.maps.Event.clearInstanceListeners(entry.marker);
      entry.marker.setMap(null);
      markersRef.current.delete(id);
    }

    // 2) 남은 것은 바뀐 부분만 손댄다
    for (const r of restaurants) {
      const selected = r.id === selectedId;
      const iconKey = markerIconKey(r, selected);
      const zIndex = selected ? 60 : 50;
      const existing = markersRef.current.get(r.id);

      if (existing) {
        // 별점·선택 상태가 그대로면 DOM 을 건드리지 않는다
        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(icon(r, selected));
          existing.iconKey = iconKey;
        }
        existing.marker.setZIndex(zIndex);
        continue;
      }

      const marker = new naver.maps.Marker({
        map,
        position: new naver.maps.LatLng(r.lat, r.lng),
        title: r.name,
        icon: icon(r, selected),
        zIndex,
      });
      // 아이콘 안의 button 을 키보드로 눌러도 여기로 온다 (click 이 버블한다)
      naver.maps.Event.addListener(marker, "click", () =>
        onSelectRef.current(r.id),
      );
      markersRef.current.set(r.id, { marker, iconKey });
    }
  }, [status, restaurants, selectedId]);

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
