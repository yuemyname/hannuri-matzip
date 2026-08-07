import { Modal } from "@/components/modal";
import { RestaurantDetail } from "@/features/restaurants/restaurant-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Modal title="맛집 상세">
      <RestaurantDetail id={id} />
    </Modal>
  );
}
