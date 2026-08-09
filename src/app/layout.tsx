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
          {/* 헤더에는 이름만 남긴다. 등록·점메추·내 정보는 지도 위로 내려갔다
              (SPEC §4.1) — 엄지가 닿는 곳에 있어야 하고, 어차피 메인에서만 쓴다.
              모달이 떠도 언마운트되지 않는다 (SHELL.md §0). */}
          <header className="z-[var(--z-header)] flex h-12 shrink-0 items-center border-b border-border bg-background px-4">
            <Link href="/" className="text-subtitle text-brand-700">
              한누리 맛집
            </Link>
          </header>

          {children}
          {modal}
        </Providers>
      </body>
    </html>
  );
}
