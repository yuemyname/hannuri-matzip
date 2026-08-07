import Link from "next/link";

// P1에서 지도 + 필터바 + 리스트 시트로 채운다. 지금은 셸 골격만.
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">lunchmap</h1>
      <p>지도와 리스트가 들어올 자리예요.</p>
      <nav className="flex flex-col items-start gap-3">
        <Link href="/pick">점메추 열기</Link>
        <Link href="/restaurants/new">맛집 등록하기</Link>
        <Link href="/restaurants/1">맛집 상세 열기</Link>
        <Link href="/me">내 정보 열기</Link>
      </nav>
    </main>
  );
}
