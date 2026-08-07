"use client";

import { useEffect, useRef, useState } from "react";
import { MapView } from "./map-view";
import type { useCurrentPosition } from "./use-current-position";
import { useMapView, type LatLng } from "./map-store";
import type { NearbyRestaurant } from "@/features/restaurants/api";

/**
 * 지도 + 위치 배너. 메인에서만 마운트한다 (지도 인스턴스는 앱 전체에 하나).
 * 카메라의 정본은 zustand 스토어다 — 풀페이지 fallback 을 다녀와도 뷰가 유지된다.
 *
 * 조회와 필터는 `MainView` 가 들고 있다. 지도와 리스트가 같은 배열을 봐야
 * 마커 수와 항목 수가 어긋나지 않는다. 반경 토글도 필터바로 옮겼다 (SPEC §4.1).
 */
export function MapPanel({
  position,
  restaurants,
  selectedId,
  onSelect,
}: {
  position: ReturnType<typeof useCurrentPosition>;
  restaurants: NearbyRestaurant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const {
    status,
    coords,
    center: geoCenter,
    isFallback,
    lowAccuracy,
    request,
  } = position;
  const center = useMapView((s) => s.center);
  const zoom = useMapView((s) => s.zoom);
  const radius = useMapView((s) => s.radius);
  const setView = useMapView((s) => s.setView);

  // skipHydration 이라 마운트 후 직접 복원한다.
  useEffect(() => {
    void useMapView.persist.rehydrate();
  }, []);

  // 카메라를 옮길지 말지. 저장된 뷰가 있으면 위치를 얻어도 함부로 옮기지 않는다 —
  // 그러면 돌아올 때마다 내 위치로 튕겨서 복원이 무의미해진다.
  const askedRef = useRef(false);
  const [focus, setFocus] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!coords) return;
    if (askedRef.current || center === null) {
      setFocus({ lat: coords.lat, lng: coords.lng });
      askedRef.current = false;
    }
  }, [coords, center]);

  const handleRequest = () => {
    askedRef.current = true;
    request();
  };

  return (
    <div className="relative size-full">
      <MapView
        initialCenter={center ?? geoCenter}
        initialZoom={zoom}
        focus={focus}
        anchor={geoCenter}
        me={coords}
        radius={radius}
        restaurants={restaurants}
        selectedId={selectedId}
        onSelect={onSelect}
        onViewChange={setView}
      />

      {/* 배너는 지도 위에 겹친다. 지도 조작을 막지 않도록 바깥은 클릭을 통과시킨다.
          조회 실패·빈 결과 안내는 리스트가 맡는다 — 같은 말을 두 군데서 하지 않는다. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <Notice
          status={status}
          isFallback={isFallback}
          lowAccuracy={lowAccuracy}
          onRequest={handleRequest}
        />
      </div>
    </div>
  );
}

function Notice({
  status,
  isFallback,
  lowAccuracy,
  onRequest,
}: {
  status: ReturnType<typeof useCurrentPosition>["status"];
  isFallback: boolean;
  lowAccuracy: boolean;
  onRequest: () => void;
}) {
  if (status === "prompting") {
    return <Bubble>위치 확인 중</Bubble>;
  }

  // 첫 진입. iOS Safari 때문에 자동 호출 대신 버튼으로 트리거한다 (SPEC §5)
  if (status === "idle") {
    return (
      <Bubble>
        <Action onClick={onRequest}>내 주변 찾기</Action>
      </Bubble>
    );
  }

  // denied / timeout / unavailable 은 같은 처리 (SPEC §5)
  if (isFallback) {
    return (
      <Bubble>
        <span className="flex flex-col">
          <span>현재 위치를 사용할 수 없어 사무실 기준으로 표시 중</span>
          {/* 브라우저가 프롬프트조차 안 띄우고 거절하는 경우가 있다.
              iOS 는 설정 › 개인정보 보호 › 위치 서비스 › Safari 웹사이트가 꺼져 있거나,
              이 사이트를 한 번 거부해두면 그렇게 된다. 다음 행동을 알려준다. */}
          {status === "denied" && (
            <span className="text-caption text-muted-foreground">
              브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요
            </span>
          )}
        </span>
        <Action onClick={onRequest}>다시 시도</Action>
      </Bubble>
    );
  }

  if (lowAccuracy) {
    return <Bubble>위치 정확도가 낮습니다</Bubble>;
  }

  return null;
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex max-w-full items-center gap-2 rounded-chip border border-border bg-background px-3 py-1.5 text-label shadow-pop"
    >
      {children}
    </div>
  );
}

function Action({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-chip px-2 py-0.5 font-medium text-brand-700 hover:bg-accent"
    >
      {children}
    </button>
  );
}
