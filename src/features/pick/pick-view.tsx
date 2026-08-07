// P4에서 채운다. 인터셉트 라우트와 풀페이지 fallback이 이 컴포넌트 하나를 같이 쓴다.
export function PickView() {
  return (
    <section>
      <h2 className="text-xl font-bold">점메추</h2>
      <p>오늘 뭐 먹을지 여기서 뽑아요.</p>
    </section>
  );
}
