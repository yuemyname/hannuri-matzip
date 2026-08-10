import { Modal } from "@/components/modal";
import { DiscoverView } from "@/features/discover/discover-view";

export default function Page() {
  return (
    <Modal title="주변 찾기">
      <DiscoverView />
    </Modal>
  );
}
