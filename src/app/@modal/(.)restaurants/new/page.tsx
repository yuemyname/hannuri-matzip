import { Modal } from "@/components/modal";
import { RestaurantNewView } from "@/features/restaurants/restaurant-new-view";

export default function Page() {
  return (
    <Modal title="맛집 등록">
      <RestaurantNewView />
    </Modal>
  );
}
