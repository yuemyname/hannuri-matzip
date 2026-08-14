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
      {/* 제목을 **가운데** 둔다 (2026-08-12 요청, 모달 머리와 같은 규칙).
          오른쪽에 [뒤로] 와 같은 몫의 빈 칸을 둬야 진짜 가운데에 온다. */}
      <header className="sticky top-0 z-[var(--z-header)] grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-background px-2">
        <button
          type="button"
          onClick={back}
          className="justify-self-start rounded-chip px-3 py-1.5 text-label whitespace-nowrap text-brand-700 hover:bg-accent"
        >
          뒤로
        </button>
        <h1 className="min-w-0 truncate text-center text-subtitle">{title}</h1>
        <span />
      </header>

      <main className="flex-1 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
