import { PageShell } from "@/components/page-shell";
import { FeedbackView } from "@/features/feedback/feedback-view";

export const metadata = { title: "피드백" };

export default function Page() {
  return (
    <PageShell title="피드백">
      <FeedbackView />
    </PageShell>
  );
}
