import { PageShell } from "@/components/page-shell";
import { RestaurantDetailView } from "@/features/restaurants/restaurant-detail-view";

export const metadata = { title: "맛집 상세" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PageShell title="맛집 상세">
      <RestaurantDetailView id={id} />
    </PageShell>
  );
}
