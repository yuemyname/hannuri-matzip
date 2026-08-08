import { PageShell } from "@/components/page-shell";
import { WelcomeView } from "@/features/onboarding/welcome-view";

export const metadata = { title: "처음 오셨네요" };

export default function Page() {
  return (
    <PageShell title="처음 오셨네요">
      <WelcomeView />
    </PageShell>
  );
}
