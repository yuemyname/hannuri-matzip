import { Modal } from "@/components/modal";
import { DiscoverView } from "@/features/discover/discover-view";

export default function Page() {
  return (
    <Modal title="검색">
      <DiscoverView />
    </Modal>
  );
}
