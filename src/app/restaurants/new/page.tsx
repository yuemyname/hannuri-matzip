import { PageShell } from "@/components/page-shell";
import { RestaurantNewView } from "@/features/restaurants/restaurant-new-view";

export const metadata = { title: "맛집 등록" };

export default function Page() {
  return (
    <PageShell title="맛집 등록">
      <RestaurantNewView />
    </PageShell>
  );
}
