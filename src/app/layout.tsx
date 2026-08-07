import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  // 하위 페이지는 title 만 적으면 template 이 뒤를 붙인다.
  title: {
    default: "한누리 맛집",
    template: "%s · 한누리 맛집",
  },
  description: "사무실 맛집 지도",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      {/* 세로 flex 로 잡아서 메인이 헤더를 뺀 나머지를 정확히 차지하게 한다.
          높이 단위는 dvh 다. 뷰포트 높이 단위는 iOS 주소창 때문에 금지 (SHELL.md §2) */}
      <body className="flex min-h-dvh flex-col">
        {/* 헤더는 셸의 일부다. 모달이 떠도 언마운트되지 않는다 (SHELL.md §0) */}
        <header className="z-[var(--z-header)] flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <Link href="/" className="text-subtitle text-brand-700">
            한누리 맛집
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/pick"
              className="rounded-chip px-3 py-1.5 text-label hover:bg-muted"
            >
              점메추
            </Link>
            <Link
              href="/me"
              className="rounded-chip px-3 py-1.5 text-label hover:bg-muted"
            >
              내 정보
            </Link>
          </nav>
        </header>

        {children}
        {modal}
      </body>
    </html>
  );
}
