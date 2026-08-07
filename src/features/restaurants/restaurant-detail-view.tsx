// P3에서 채운다. 인터셉트 라우트와 풀페이지 fallback이 이 컴포넌트 하나를 같이 쓴다.
export function RestaurantDetailView({ id }: { id: string }) {
  return (
    <section>
      <h2 className="text-xl font-bold">맛집 상세</h2>
      <p>맛집 {id}의 정보와 리뷰가 들어올 자리예요.</p>
    </section>
  );
}
