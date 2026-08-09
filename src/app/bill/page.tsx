import { PageShell } from "@/components/page-shell";
import { BillView } from "@/features/bill/bill-view";

export const metadata = { title: "밥값 내기" };

export default function Page() {
  return (
    <PageShell title="밥값 내기">
      <BillView />
    </PageShell>
  );
}
