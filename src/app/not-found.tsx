import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

// 없는 주소로 들어왔을 때 (WBS 6.1). 기본 Next 화면은 셸도 문구도 우리 것이 아니다.
export const metadata = { title: "없는 주소" };

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-title">없는 주소예요</p>
      <p className="text-caption text-muted-foreground">
        주소가 바뀌었거나 지워진 화면일 수 있어요
      </p>
      <Link href="/" className={buttonClass()}>
        지도로 돌아가기
      </Link>
    </main>
  );
}
