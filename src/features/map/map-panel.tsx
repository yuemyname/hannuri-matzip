"use client";

import { MapView } from "./map-view";
import { useCurrentPosition } from "./use-current-position";

/**
 * 지도 + 위치 상태 배너. 메인에서만 마운트한다 (지도 인스턴스는 앱 전체에 하나).
 * 반경 Circle 과 현재위치 마커는 1.3, 뷰 상태 복원은 1.4 에서 붙는다.
 */
export function MapPanel() {
  const { status, center, isFallback, lowAccuracy, request } =
    useCurrentPosition();

  return (
    <div className="relative size-full">
      <MapView center={center} />

      {/* 배너는 지도 위에 겹친다. 지도 조작을 막지 않도록 바깥은 클릭을 통과시킨다 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <Notice
          status={status}
          isFallback={isFallback}
          lowAccuracy={lowAccuracy}
          onRequest={request}
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
