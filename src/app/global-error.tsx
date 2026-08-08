"use client";

/**
 * layout 자체가 죽었을 때의 마지막 그물 (WBS 6.1).
 * 여기는 `html`/`body` 를 직접 그려야 한다 — layout 이 안 돌기 때문이다.
 *
 * 전역 CSS 도 못 믿는 상황이라 문구만 두고 끝낸다. 흰 화면만 아니면 된다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body>
        <main
          style={{
            display: "flex",
            minHeight: "100dvh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            padding: "1.5rem",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p>앱을 여는 데 문제가 생겼어요</p>
          <button type="button" onClick={reset}>
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
