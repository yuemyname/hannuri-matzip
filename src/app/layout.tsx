import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "lunchmap",
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
      <body className="antialiased">
        {children}
        {modal}
      </body>
    </html>
  );
}
