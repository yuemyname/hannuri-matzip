import { Modal } from "@/components/modal";
import { WelcomeView } from "@/features/onboarding/welcome-view";

export default function Page() {
  return (
    <Modal title="처음 오셨네요">
      <WelcomeView />
    </Modal>
  );
}
