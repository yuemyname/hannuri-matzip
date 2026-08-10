import { Modal } from "@/components/modal";
import { FeedbackView } from "@/features/feedback/feedback-view";

export default function Page() {
  return (
    <Modal title="피드백">
      <FeedbackView />
    </Modal>
  );
}
