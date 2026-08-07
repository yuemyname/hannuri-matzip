import { Modal } from "@/components/modal";
import { MeView } from "@/features/me/me-view";

export default function Page() {
  return (
    <Modal title="내 정보">
      <MeView />
    </Modal>
  );
}
