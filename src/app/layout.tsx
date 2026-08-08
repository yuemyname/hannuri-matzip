import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "./providers";
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
          높이 단위는 dvh 다. 뷰포트 높이 단위는 iOS 주소창 때문에 금지 (SHELL.md §2)

          **min-h 가 아니라 h 다.** min-h 면 body 높이가 내용에 따라 늘어나서
          메인의 리스트가 자기 안에서 스크롤하지 못하고 문서 전체를 밀어낸다
          (지도가 위로 밀려 올라간다). 풀페이지 fallback 은 PageShell 이
          min-h-dvh 로 잡고 있어서 길어지면 그대로 문서가 스크롤된다. */}
      <body className="flex h-dvh flex-col">
        <Providers>
          {/* 헤더는 셸의 일부다. 모달이 떠도 언마운트되지 않는다 (SHELL.md §0) */}
          <header className="z-[var(--z-header)] flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
            <Link href="/" className="text-subtitle text-brand-700">
              한누리 맛집
            </Link>
            <nav className="flex items-center gap-1">
              {/* 리스트를 없애면서 빈 상태에 있던 [맛집 등록하기] 도 같이 사라졌다.
                  등록은 조건과 무관하게 늘 열려 있어야 하는 길이라 헤더로 올린다. */}
              <Link
                href="/restaurants/new"
                className="rounded-chip px-3 py-1.5 text-label hover:bg-muted"
              >
                등록
              </Link>
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
        </Providers>
      </body>
    </html>
  );
}
