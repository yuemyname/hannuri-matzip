import { PageShell } from "@/components/page-shell";
import { DiscoverView } from "@/features/discover/discover-view";

export const metadata = { title: "주변 찾기" };

export default function Page() {
  return (
    <PageShell title="주변 찾기">
      <DiscoverView />
    </PageShell>
  );
}
