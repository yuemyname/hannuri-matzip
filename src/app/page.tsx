import Link from "next/link";
import { MapView } from "@/features/map/map-view";

// 메인 — 지도가 배경에 항상 살아있고 나머지는 그 위에 모달로 뜬다 (SHELL.md §0).
// 필터바와 리스트 시트는 P2 에서 채운다.
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="h-[40dvh] shrink-0">
        <MapView />
      </div>

      <nav className="flex flex-col items-start gap-3 p-6">
        <Link href="/pick">점메추 열기</Link>
        <Link href="/restaurants/new">맛집 등록하기</Link>
        <Link href="/restaurants/1">맛집 상세 열기</Link>
        <Link href="/me">내 정보 열기</Link>
      </nav>
    </main>
  );
}
