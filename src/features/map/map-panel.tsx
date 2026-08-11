"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapView } from "./map-view";
import type { useCurrentPosition } from "./use-current-position";
import { useMapView, useMapViewHydrated, type LatLng } from "./map-store";
import type { NearbyRestaurant } from "@/features/restaurants/api";
import type { SelectSource } from "@/features/restaurants/select-source";
import { usePinMode } from "@/features/restaurants/pin-store";
import { clusterByGrid } from "./cluster";
import { DEFAULT_ZOOM, MAX_ZOOM, OFFICE, ZOOM_INTO_STEP } from "./config";

/**
 * 지도 + 위치 배너. 메인에서만 마운트한다 (지도 인스턴스는 앱 전체에 하나).
 * 카메라의 정본은 zustand 스토어다 — 풀페이지 fallback 을 다녀와도 뷰가 유지된다.
 *
 * 조회와 필터는 `MainView` 가 들고 있다. 마커는 그 결과 배열을 그대로 그리므로
 * 카테고리 토글이 곧 마커 필터가 된다. 반경 토글은 하단 바에 있다 (SPEC §4.1).
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
  } = position;
  const center = useMapView((s) => s.center);
  const zoom = useMapView((s) => s.zoom);
  const setView = useMapView((s) => s.setView);
  const bounds = useMapView((s) => s.bounds);
  const flyTo = useMapView((s) => s.flyTo);
  const clearFlyTo = useMapView((s) => s.clearFlyTo);

  // 겹친 것을 숫자 원으로 합친다. 격자 칸 수가 곧 핀 상한이라, 아무것도 버리지
  // 않으면서 한 화면에 뜨는 핀 개수가 고정된다 (cluster.ts).
  const clusters = useMemo(
    () => clusterByGrid(restaurants, bounds),
    [restaurants, bounds],
  );

  // 숫자 원을 누르면 그리로 확대해 들어간다. 확대가 곧 갈라짐이다.
  // 값이 아니라 "이 값으로 가라" 는 신호라, 같은 줌을 두 번 눌러도 통하도록
  // 카운터를 함께 올린다 — 값만 보면 두 번째 클릭이 무시된다.
  const [zoomTo, setZoomTo] = useState<{ zoom: number; nonce: number } | null>(
    null,
  );
  // 등록 화면의 핀 조정 단계 (SHELL.md §4). 모달 안에 지도를 새로 만들지 않고
  // 이 지도를 그대로 쓴다.
  const pinning = usePinMode((s) => s.active);
  // 등록 화면이 "여기로 옮겨라" 하고 넘긴 검색 좌표 (SPEC §4.4-3).
  const pinTarget = usePinMode((s) => s.target);
  const clearPinTarget = usePinMode((s) => s.clearTarget);

  // 복원이 끝나야 지도를 만든다. 안 그러면 기본값(50m)으로 한 번 만들어졌다가
  // 복원 직후 200m 로 fitBounds 가 다시 돌아 카메라가 튄다.
  const hydrated = useMapViewHydrated();

  // 카메라를 옮길지 말지. 저장된 뷰가 있으면 위치를 얻어도 함부로 옮기지 않는다 —
  // 그러면 돌아올 때마다 내 위치로 튕겨서 복원이 무의미해진다.
  //
  // **사용자가 "내 위치로 가자" 고 말하는 창구는 [◎] 하나뿐이다** (2026-08-11).
  // 그쪽은 스스로 `requestFlyTo` 로 명령을 보내므로 여기서는 첫 방문만 본다.
  const [focus, setFocus] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!coords || center !== null) return;
    setFocus({ lat: coords.lat, lng: coords.lng });
  }, [coords, center]);

  const handleSelect = (id: string) => onSelect(id, "map");

  const zoomInto = useCallback(
    (to: LatLng) => {
      setFocus(to);
      setZoomTo((prev) => ({
        zoom: Math.min((zoom ?? DEFAULT_ZOOM) + ZOOM_INTO_STEP, MAX_ZOOM),
        nonce: (prev?.nonce ?? 0) + 1,
      }));
    },
    [zoom],
  );

  // 지도 밖(오른쪽 위 [내 위치] 버튼)에서 온 카메라 명령. 핀 타깃과 같은 꼴이다 —
  // 한 번 옮기고 곧바로 비운다. 안 비우면 다음 렌더에서 또 옮겨서 지도가 붙잡힌다.
  useEffect(() => {
    if (!flyTo) return;
    setFocus({ lat: flyTo.lat, lng: flyTo.lng });
    clearFlyTo();
  }, [flyTo, clearFlyTo]);

  // 등록의 핀 단계로 들어오면 검색한 가게 좌표로 한 번 옮긴다.
  // **안 옮기면 핀이 내가 보던 자리에 찍힌다** — 그러면 미세조정이 아니라
  // 사용자가 가게를 지도에서 처음부터 찾아가야 한다 (SPEC §4.4-3).
  //
  // 옮긴 뒤 곧바로 비운다. 안 비우면 사용자가 핀을 끌어 놓은 다음 이 이펙트가
  // 또 돌 때 검색 좌표로 되돌려 버린다.
  useEffect(() => {
    if (!pinTarget) return;
    setFocus(pinTarget);
    clearPinTarget();
  }, [pinTarget, clearPinTarget]);

  // 카메라는 **앱 밖에서 고른 경우에만** 옮긴다 (점메추 [여기로 갈게요], WBS 4.4).
  // 마커를 눌렀을 때 옮기면 방금 누른 것으로 지도가 튄다 (WBS 2.5).
  //
  // **한 선택에 딱 한 번만 옮긴다.** `restaurants` 는 조회할 때마다 새 배열이라
  // 그것만 보고 옮기면, 지도를 끌 때마다(→ 재조회 → 새 배열) 고른 곳으로 다시
  // 끌려간다. 게다가 옮기는 것이 곧 재조회라 그 자리에서 무한히 돈다 —
  // 실제로 지도가 조금씩 밀려 나가며 요청을 계속 쐈다.
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (selectionSource !== null || !selectedId) {
      focusedFor.current = null;
      return;
    }
    if (focusedFor.current === selectedId) return;
    const hit = restaurants.find((r) => r.id === selectedId);
    if (!hit) return;
    focusedFor.current = selectedId;
    setFocus({ lat: hit.lat, lng: hit.lng });
  }, [selectedId, selectionSource, restaurants]);

  return (
    <div className="relative size-full">
      {hydrated ? (
        <MapView
          initialCenter={center ?? geoCenter}
          initialZoom={zoom}
          focus={focus}
          me={coords}
          clusters={clusters}
          zoomTo={zoomTo}
          selectedId={selectedId}
          onSelect={handleSelect}
          onZoomInto={zoomInto}
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
          여기는 **위치** 문제만 말한다. 조회 실패·빈 결과는 하단 바가 맡는다 —
          같은 말을 두 군데서 하지 않는다.

          **위아래·좌우로 자리를 비켜 준다.** 위 왼쪽에는 보기 전환이, 오른쪽에는
          [◎][🔍][+] 가 세로로 서 있다. 안 비키면 배너가 그 밑으로 들어가 양쪽이
          잘린 채로 읽힌다 (2026-08-11 에 실제로 그랬다). 위로는 전환 버튼 높이만큼,
          오른쪽으로는 버튼 한 칸만큼 밀어 둔다. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3 pt-[4.25rem] pr-[4.5rem]">
        <Notice
          status={status}
          isFallback={isFallback}
          lowAccuracy={lowAccuracy}
        />
      </div>
    </div>
  );
}

/**
 * 위치 상태 알림.
 *
 * **버튼이 없다** (2026-08-11). 예전에는 여기 [내 주변 찾기]·[다시 시도] 가
 * 붙어 있었는데, 오른쪽 위 [◎] 가 정확히 같은 일을 한다 — 위치를 아직 못
 * 얻었으면 물어보고, 얻었으면 지도를 그리로 옮긴다. 같은 일을 하는 버튼이
 * 둘이면 어느 쪽이 무엇인지 매번 생각하게 되므로 [◎] 하나로 합쳤다.
 * 여기는 **왜 이렇게 보이는지**만 말한다.
 */
function Notice({
  status,
  isFallback,
  lowAccuracy,
}: {
  status: ReturnType<typeof useCurrentPosition>["status"];
  isFallback: boolean;
  lowAccuracy: boolean;
}) {
  if (status === "prompting") {
    return <Bubble>위치 확인 중</Bubble>;
  }

  // http 로 들어왔다. 다시 시도를 줘 봐야 결과가 같으므로 주지 않는다 —
  // 할 일은 주소를 바꾸는 것 하나뿐이다.
  if (status === "insecure") {
    return (
      <Bubble>
        <span className="flex flex-col">
          <span>{OFFICE.name} 기준으로 표시 중</span>
          <span className="text-caption text-muted-foreground">
            위치는 https 주소에서만 쓸 수 있어요. 배포된 주소로 열어 주세요
          </span>
        </span>
      </Bubble>
    );
  }

  // 첫 진입에는 아무 말도 안 한다. 아직 아무 일도 안 일어났고, 위치를 원하면
  // [◎] 를 누르면 된다 (iOS Safari 때문에 자동 호출은 안 한다 — SPEC §5).
  // denied / timeout / unavailable 은 같은 처리 (SPEC §5)
  if (isFallback) {
    return (
      <Bubble>
        <span className="flex flex-col">
          <span>현재 위치를 사용할 수 없어 {OFFICE.name} 기준으로 표시 중</span>
          {/* 브라우저가 프롬프트조차 안 띄우고 거절하는 경우가 있다.
              **iPhone 은 고칠 자리가 브라우저가 아니라 iOS 설정 앱이다.**
              "브라우저 설정" 이라고만 적어 두면 사파리 안을 아무리 뒤져도 못 찾는다
              (맥 사파리는 되는데 아이폰만 안 되는 게 대부분 이 경우다).
              그래서 여기서만 기기를 나눠 길을 그대로 적어 준다. */}
          {status === "denied" && (
            <span className="text-caption text-muted-foreground">
              {isIOS()
                ? "설정 › 개인정보 보호 및 보안 › 위치 서비스 › Safari 웹사이트를 켜고, 사파리 주소창의 ᴀA › 웹사이트 설정에서 위치를 허용해 주세요"
                : "브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요"}
            </span>
          )}
          {/* 고친 다음에 무엇을 누를지 적어 준다. 버튼을 [◎] 로 합쳤으므로
              여기서는 그 자리를 가리키기만 한다. */}
          <span className="text-caption text-muted-foreground">
            위치를 켠 뒤 오른쪽 위 ◎ 를 눌러 주세요
          </span>
        </span>
      </Bubble>
    );
  }

  if (lowAccuracy) {
    return <Bubble>위치 정확도가 낮습니다</Bubble>;
  }

  return null;
}

/**
 * iOS 기기인지. **안내 문구를 고르는 데만 쓴다** — 기능 분기에 쓰지 않는다.
 *
 * iPadOS 13+ 는 자기를 Mac 으로 소개해서 여기 안 걸린다. 그 경우 일반 문구가
 * 나가는데, 틀린 말은 아니라서 그냥 둔다. UA 로 기능을 가르면 이런 예외가
 * 곧바로 버그가 되지만, 문구는 아니다.
 */
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
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
