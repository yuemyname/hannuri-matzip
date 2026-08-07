// 거리 — 1000m 미만은 340m, 이상은 1.2km. 숫자 폭을 고정해 리스트가 흔들리지 않게 한다.

export function Distance({ meters }: { meters: number }) {
  // 먼저 반올림한다. 999.6m 을 "1000m" 로 적지 않기 위해서다.
  const m = Math.round(Math.max(meters, 0));
  const text = m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;

  return (
    <span className="tnum text-caption text-muted-foreground">{text}</span>
  );
}
