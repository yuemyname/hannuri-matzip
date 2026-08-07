"use client";

import { useRouter } from "next/navigation";

/**
 * 풀페이지 fallback 용 껍데기 (SHELL.md §1).
 * 모달 URL 을 직접 열거나 새로고침했을 때 이쪽이 그려진다.
 * 내용 컴포넌트는 모달과 같은 것을 쓴다 — 복붙 금지.
 */
export function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  // 앱 안에서 넘어왔으면 뒤로, 아니면 메인으로.
  // history.length 로 판단하면 안 된다 — 슬랙 링크로 들어온 경우에도 1 보다 커서
  // 뒤로가기가 앱 밖(빈 탭·외부 사이트)으로 나가버린다. referrer 로 본다.
  const back = () => {
    const cameFromApp =
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin;
    if (cameFromApp) router.back();
    else router.push("/");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-[var(--z-header)] flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
        <button
          type="button"
          onClick={back}
          className="rounded-chip px-3 py-1.5 text-label text-brand-700 hover:bg-accent"
        >
          뒤로
        </button>
        <h1 className="min-w-0 truncate text-subtitle">{title}</h1>
      </header>

      <main className="flex-1 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
