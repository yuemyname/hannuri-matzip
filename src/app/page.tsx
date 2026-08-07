import Link from "next/link";
import { MapPanel } from "@/features/map/map-panel";

// 메인 — 지도가 배경에 항상 살아있고 나머지는 그 위에 모달로 뜬다 (SHELL.md §0).
// 필터바와 맛집 리스트는 P2 에서 이 자리를 채운다.
export default function Home() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="h-[40dvh] shrink-0">
        <MapPanel />
      </div>

      <section className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="text-muted-foreground">주변 맛집 목록이 여기 들어와요</p>

        {/* 2.4 리스트가 생기면 상세는 카드에서, 등록은 필터바에서 연다.
            지금은 모달 경로를 확인할 수 있게 임시로 둔다. */}
        <div className="mt-4 flex flex-col items-start gap-2">
          <Link href="/restaurants/new" className="text-brand-700">
            맛집 등록하기
          </Link>
          <Link href="/restaurants/1" className="text-brand-700">
            맛집 상세 열기 (임시)
          </Link>
        </div>
      </section>
    </main>
  );
}
