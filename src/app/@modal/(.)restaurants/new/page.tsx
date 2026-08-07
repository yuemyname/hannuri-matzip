import { ModalPlaceholder } from "@/components/shell-placeholder";
import { RestaurantNewView } from "@/features/restaurants/restaurant-new-view";

export default function Page() {
  return (
    <ModalPlaceholder>
      <RestaurantNewView />
    </ModalPlaceholder>
  );
}
