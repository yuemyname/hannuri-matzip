import { PageShell } from "@/components/page-shell";
import { PickView } from "@/features/pick/pick-view";

export const metadata = { title: "점메추" };

export default function Page() {
  return (
    <PageShell title="점메추">
      <PickView />
    </PageShell>
  );
}
