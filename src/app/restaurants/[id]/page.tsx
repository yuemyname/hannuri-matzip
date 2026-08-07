import { PageShell } from "@/components/page-shell";
import { RestaurantDetail } from "@/features/restaurants/restaurant-detail";

export const metadata = { title: "맛집 상세" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PageShell title="맛집 상세">
      <RestaurantDetail id={id} />
    </PageShell>
  );
}
