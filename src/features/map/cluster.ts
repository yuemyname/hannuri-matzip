import type { NearbyRestaurant } from "@/features/restaurants/api";
import type { Bounds } from "./map-store";

/**
 * 격자 클러스터링 — 겹친 마커를 한 개의 숫자 원으로 합친다.
 *
 * **상한을 "몇 개까지 그린다" 로 두지 않는다.** 그렇게 하면 나머지는 조용히
 * 사라지고, 사용자는 못 본 게 있다는 것조차 모른다. 대신 화면을 격자로 나눠
 * 한 칸에 하나씩만 그린다 — 칸 수가 곧 상한이라 **아무것도 안 버리면서** 핀 수가
 * 고정된다. 칸에 여럿 있으면 숫자 원이 되고, 확대하면 갈라진다.
 *
 * 격자는 화면 픽셀이 아니라 위경도 비율로 나눈다. 지도 한 화면 정도의 범위에서는
 * 둘이 거의 같고, 이 방식은 SDK 의 projection API 를 안 타서 테스트하기 쉽다.
 *
 * **상한에 안 걸리면 아예 묶지 않는다.** 묶는 건 핀이 넘칠 때의 대응이지 기본값이
 * 아니다 — 15곳뿐인데 원 두 개로 합쳐 두면 이름을 보려고 확대를 두 번 해야 한다.
 */

/** 가로 칸 수 × 세로 칸 수 = 한 화면 최대 핀 수 */
export const CLUSTER_COLS = 5;
export const CLUSTER_ROWS = 6;

/** 한 화면에 그려지는 핀의 상한. 격자 칸 수라서 구조적으로 지켜진다 */
export const MAX_PINS = CLUSTER_COLS * CLUSTER_ROWS;

export type Cluster = {
  /** 마커 diff 의 열쇠. 같은 칸 · 같은 구성원이면 같은 값이라 DOM 을 안 건드린다 */
  key: string;
  lat: number;
  lng: number;
  items: NearbyRestaurant[];
};

/**
 * 칸마다 하나로 묶는다. 좌표는 그 칸에 든 것들의 평균 —
 * 칸 한복판에 찍으면 실제로 아무것도 없는 자리에 원이 떠서 어색하다.
 *
 * `bounds` 가 없거나 납작하면(폭·높이 0) 묶지 않고 그대로 돌려준다. 억지로
 * 나누면 전부 한 칸에 들어가서 화면이 원 하나가 된다.
 */
export function clusterByGrid(
  restaurants: readonly NearbyRestaurant[],
  bounds: Bounds | null,
): Cluster[] {
  const spanLat = bounds ? bounds.maxLat - bounds.minLat : 0;
  const spanLng = bounds ? bounds.maxLng - bounds.minLng : 0;

  // **넘치지 않으면 묶지 않는다.** 격자는 상한을 지키기 위한 장치지, 목적이 아니다.
  // 사무실 앞 15곳을 원 두 개로 합쳐 놓으면 확대를 두 번 해야 이름이 보인다 —
  // 상한에 안 걸리는데 굳이 이름을 감출 이유가 없다.
  if (!bounds || spanLat <= 0 || spanLng <= 0 || restaurants.length <= MAX_PINS) {
    return restaurants.map((r) => ({
      key: r.id,
      lat: r.lat,
      lng: r.lng,
      items: [r],
    }));
  }


  const cells = new Map<string, NearbyRestaurant[]>();
  for (const r of restaurants) {
    // 화면 밖으로 살짝 나간 것도 가장자리 칸에 넣는다. 조회 결과와 화면이 한 프레임
    // 어긋나는 순간이 있는데, 그때 클램프를 안 하면 칸 번호가 음수로 튄다.
    const col = clamp(
      Math.floor(((r.lng - bounds.minLng) / spanLng) * CLUSTER_COLS),
      0,
      CLUSTER_COLS - 1,
    );
    const row = clamp(
      Math.floor(((r.lat - bounds.minLat) / spanLat) * CLUSTER_ROWS),
      0,
      CLUSTER_ROWS - 1,
    );
    const key = `${col}:${row}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(r);
    else cells.set(key, [r]);
  }

  return [...cells].map(([cell, items]) => {
    // 한 곳뿐이면 그 맛집 자체다. 열쇠를 id 로 둬야 확대·축소로 칸이 바뀌어도
    // 같은 마커로 인식되어 깜빡이지 않는다.
    if (items.length === 1) {
      const r = items[0];
      return { key: r.id, lat: r.lat, lng: r.lng, items };
    }
    const lat = items.reduce((s, r) => s + r.lat, 0) / items.length;
    const lng = items.reduce((s, r) => s + r.lng, 0) / items.length;
    // 구성원이 바뀌면 숫자가 바뀌므로 열쇠에 포함한다. 정렬해서 순서 차이로
    // 헛되이 다시 그리지 않게 한다.
    const ids = items
      .map((r) => r.id)
      .sort()
      .join(",");
    return { key: `c${cell}:${ids}`, lat, lng, items };
  });
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
