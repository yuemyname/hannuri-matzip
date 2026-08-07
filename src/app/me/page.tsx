import { PageShell } from "@/components/page-shell";
import { MeView } from "@/features/me/me-view";

export const metadata = { title: "내 정보" };

export default function Page() {
  return (
    <PageShell title="내 정보">
      <MeView />
    </PageShell>
  );
}
