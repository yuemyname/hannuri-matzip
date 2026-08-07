import type { Metadata } from "next";
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
      <body>
        {children}
        {modal}
      </body>
    </html>
  );
}
