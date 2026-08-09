import type { LatLng } from "./map-store";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 두 좌표 사이 거리(m). 하버사인.
 *
 * 카드에 적히는 거리는 **언제나 내 위치 기준**이어야 한다. 반경 조회의 기준점은
 * 지도를 끌면 따라 움직이는데(그래야 옮긴 곳의 맛집이 보인다), 그때 서버가 준
 * `distance_m` 을 그대로 쓰면 "지금 보고 있는 화면 한복판에서 35m" 가 되어
 * 걸어갈 거리를 묻는 사람에게 거짓말이 된다. 그래서 화면용 거리는 여기서 다시 잰다.
 *
 * 반경이 수백 m 짜리라 지구를 구로 봐도 오차가 무시할 수준이다.
 */
export function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
