import { PagePlaceholder } from "@/components/shell-placeholder";
import { RestaurantDetailView } from "@/features/restaurants/restaurant-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder>
      <RestaurantDetailView id={id} />
    </PagePlaceholder>
  );
}
