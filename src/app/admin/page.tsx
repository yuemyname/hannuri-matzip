import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { AdminView } from "@/features/admin/admin-view";

export const metadata: Metadata = {
  title: "관리",
  // 사내용이라도 검색엔진에 걸릴 이유가 없다.
  robots: { index: false, follow: false },
};

/**
 * 관리자 화면. 지도 셸 위의 모달이 아니라 별개 풀페이지다 (admin-view.tsx 주석 참고).
 * 인터셉트 라우트를 안 만드는 유일한 화면이라 `@modal` 짝이 없다.
 */
export default function AdminPage() {
  return (
    <PageShell title="관리">
      <AdminView />
    </PageShell>
  );
}
