"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionBootstrap } from "@/lib/supabase/session-bootstrap";

/**
 * 클라이언트 전역 배선. 서버 상태는 전부 TanStack Query 를 지난다 (CLAUDE.md).
 *
 * QueryClient 를 모듈 최상단에서 만들면 서버에서 한 번 만들어져 요청 간에 공유된다.
 * useState 로 마운트마다 하나씩 만든다.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 점심 한 끼 동안 맛집 목록이 바뀔 일은 거의 없다. 지도를 조금씩
            // 움직일 때마다 다시 부르지 않도록 넉넉히 둔다.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {/* 익명 세션 확보. 렌더하는 건 없고 화면을 막지도 않는다 (SPEC §2.4) */}
      <SessionBootstrap />
      {children}
    </QueryClientProvider>
  );
}
