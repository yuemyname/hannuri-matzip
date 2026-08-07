// 별점 — 채워진 별 + 숫자 병기.
// 색만으로 정보를 전달하지 않는다 (CLAUDE.md 접근성). 별이 안 보여도 숫자가 남는다.

const MAX = 5;

function StarRow({ className }: { className: string }) {
  return (
    <span className={`inline-flex shrink-0 ${className}`}>
      {Array.from({ length: MAX }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-4 shrink-0"
        >
          <path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" />
        </svg>
      ))}
    </span>
  );
}

export function Rating({
  value,
  count,
}: {
  /** 평균 별점 0–5 */
  value: number;
  /** 리뷰 수. 0이면 "평가 없음"으로 표시한다 */
  count?: number;
}) {
  const clamped = Math.min(Math.max(value, 0), MAX);
  // 데이터에서 계산한 채움 비율. 디자인 값이 아니라 값 그 자체라 인라인 스타일로 둔다.
  const fill = `${(clamped / MAX) * 100}%`;
  const empty = count === 0;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={
        empty
          ? "아직 평가 없음"
          : `5점 만점에 ${clamped.toFixed(1)}점${count === undefined ? "" : `, 리뷰 ${count}건`}`
      }
    >
      <span className="relative inline-flex" aria-hidden="true">
        <StarRow className="text-star-empty" />
        {!empty && (
          <span
            className="absolute top-0 left-0 inline-flex overflow-hidden text-star"
            style={{ width: fill }}
          >
            <StarRow className="" />
          </span>
        )}
      </span>

      {empty ? (
        <span className="text-caption text-muted-foreground">평가 없음</span>
      ) : (
        <>
          <span className="tnum text-label font-medium">
            {clamped.toFixed(1)}
          </span>
          {count !== undefined && (
            <span className="tnum text-caption text-muted-foreground">
              ({count})
            </span>
          )}
        </>
      )}
    </span>
  );
}
