import { PageShell } from "@/components/page-shell";
import { DiscoverView } from "@/features/discover/discover-view";

export const metadata = { title: "검색" };

export default function Page() {
  return (
    <PageShell title="검색">
      <DiscoverView />
    </PageShell>
  );
}
