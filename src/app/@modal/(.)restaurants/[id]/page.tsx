import { Modal } from "@/components/modal";
import { RestaurantDetailView } from "@/features/restaurants/restaurant-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Modal title="맛집 상세">
      <RestaurantDetailView id={id} />
    </Modal>
  );
}
