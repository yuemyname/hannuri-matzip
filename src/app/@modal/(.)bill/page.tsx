import { Modal } from "@/components/modal";
import { BillView } from "@/features/bill/bill-view";

export default function Page() {
  return (
    <Modal title="밥값 내기">
      <BillView />
    </Modal>
  );
}
