import { PageShell } from "@/components/page-shell";
import { RestaurantNewView } from "@/features/restaurants/restaurant-new-view";

export const metadata = { title: "맛집 등록" };

// 풀페이지 fallback 에는 배경 지도가 없다. 지도를 새로 만들지 않기로 했으므로
// (SHELL.md §4) 핀 조정 단계를 건너뛰고 검색 좌표를 그대로 쓴다.
export default function Page() {
  return (
    <PageShell title="맛집 등록">
      <RestaurantNewView canPin={false} />
    </PageShell>
  );
}
