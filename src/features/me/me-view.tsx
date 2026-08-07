// P5에서 채운다. 인터셉트 라우트와 풀페이지 fallback이 이 컴포넌트 하나를 같이 쓴다.
export function MeView() {
  return (
    <section>
      <h2 className="text-xl font-bold">내 정보</h2>
      <p>내 리뷰와 등록한 맛집, 추천 히스토리가 들어올 자리예요.</p>
    </section>
  );
}
