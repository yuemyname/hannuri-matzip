"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * 라우트 에러 바운더리 (WBS 6.1). 렌더 중 던져진 예외를 여기서 받는다.
 * **이게 없으면 흰 화면이 남는다** — 그게 DoD 가 막으려는 상태다.
 *
 * 셸(헤더)은 layout 이 들고 있어서 여기서 다시 그리지 않는다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 사용자에게는 안 보여주되 원인은 남긴다. digest 로 서버 로그와 맞춘다.
    console.error("route error", error.digest, error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      {/* 사과하지 않고 다음 행동을 알려준다 (CLAUDE.md) */}
      <p className="text-title">화면을 그리지 못했어요</p>
      <p className="text-caption text-muted-foreground">
        잠시 후 다시 시도하거나, 지도로 돌아가 주세요
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={reset}>다시 시도</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          지도로 돌아가기
        </Button>
      </div>
    </main>
  );
}
