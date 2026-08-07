"use client";

import { useEffect } from "react";
import { ensureSession } from "./session";

/**
 * 앱 부트스트랩에서 익명 세션을 한 번 확보한다 (SPEC §2.4). 렌더하는 건 없다.
 *
 * 화면을 막지 않는다. 지도는 세션 없이도 뜨고, 세션이 필요한 조회는
 * 각자 `ensureSession()` 을 await 하면 된다 — 같은 프로미스라 두 번 발급되지 않는다.
 *
 * 실패하면 조용히 넘어갔다가 다시 시도한다. 사용자에게는 아무것도 알리지 않는다.
 * 여기서 에러를 띄우면 "로그인이 있다"는 걸 드러내는 셈이라 §2.4 에 어긋난다.
 */
export function SessionBootstrap() {
  useEffect(() => {
    let alive = true;

    void ensureSession();

    // 오프라인으로 실패했을 수 있다. 네트워크가 돌아오거나 탭으로 복귀하면 다시 본다.
    // ensureSession 은 성공한 세션을 캐시하므로 재호출이 세션을 새로 만들지 않는다.
    const retry = () => {
      if (alive && navigator.onLine) void ensureSession();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };

    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
