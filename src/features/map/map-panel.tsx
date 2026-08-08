"use client";

import { useEffect, useRef, useState } from "react";
import { MapView } from "./map-view";
import type { useCurrentPosition } from "./use-current-position";
import { useMapView, useMapViewHydrated, type LatLng } from "./map-store";
import type { NearbyRestaurant } from "@/features/restaurants/api";
import type { SelectSource } from "@/features/restaurants/select-source";
import { usePinMode } from "@/features/restaurants/pin-store";

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
  selectionSource,
  onSelect,
}: {
  position: ReturnType<typeof useCurrentPosition>;
  restaurants: NearbyRestaurant[];
  selectedId: string | null;
  /** 선택이 어디서 왔는지. null 이면 앱 밖(점메추 등)에서 온 것이다 */
  selectionSource: SelectSource | null;
  onSelect: (id: string, source: SelectSource) => void;
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
  // 등록 화면의 핀 조정 단계 (SHELL.md §4). 모달 안에 지도를 새로 만들지 않고
  // 이 지도를 그대로 쓴다.
  const pinning = usePinMode((s) => s.active);

  // 복원이 끝나야 지도를 만든다. 안 그러면 기본값(50m)으로 한 번 만들어졌다가
  // 복원 직후 200m 로 fitBounds 가 다시 돌아 카메라가 튄다.
  const hydrated = useMapViewHydrated();

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

  const handleSelect = (id: string) => onSelect(id, "map");

  // 카메라는 **앱 밖에서 고른 경우에만** 옮긴다 (점메추 [여기로 갈게요], WBS 4.4).
  // 마커를 눌렀을 때 옮기면 방금 누른 것으로 지도가 튀고,
  // 리스트 카드를 훑을 때 옮기면 마우스만 지나가도 지도가 계속 움직인다 (WBS 2.5).
  useEffect(() => {
    if (selectionSource !== null || !selectedId) return;
    const hit = restaurants.find((r) => r.id === selectedId);
    if (hit) setFocus({ lat: hit.lat, lng: hit.lng });
  }, [selectedId, selectionSource, restaurants]);

  return (
    <div className="relative size-full">
      {hydrated ? (
        <MapView
          initialCenter={center ?? geoCenter}
          initialZoom={zoom}
          focus={focus}
          anchor={geoCenter}
          me={coords}
          radius={radius}
          restaurants={restaurants}
          selectedId={selectedId}
          onSelect={handleSelect}
          onViewChange={setView}
        />
      ) : (
        // 한 프레임짜리 자리. dynamic() 로딩 표시와 같은 모습이라 티가 안 난다.
        <div className="flex size-full items-center justify-center bg-muted">
          <span className="text-caption text-muted-foreground">
            지도 불러오는 중
          </span>
        </div>
      )}

      {/* 핀 조정 중에는 지도 정중앙에 핀을 고정한다. 핀을 끄는 게 아니라 지도를
          움직인다 — 모바일에서 작은 핀을 손가락으로 끄는 것보다 정확하다 (SHELL.md §4). */}
      {pinning && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          {/* 핀 끝이 정확히 중심에 오도록 아래로 절반만큼 올려 둔다 */}
          <span className="-translate-y-1/2">
            <span className="block size-5 rounded-chip border-2 border-white bg-primary shadow-marker" />
            <span className="mx-auto block h-3 w-px bg-primary" />
          </span>
        </div>
      )}

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
