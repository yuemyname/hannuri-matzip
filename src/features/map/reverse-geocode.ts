"use client";

import type { LatLng } from "./map-store";

/**
 * 좌표 → 지역명 목록, **좁은 것부터** (예: `["광진구 구의동", "광진구"]`).
 *
 * **왜 필요한가**: 네이버 지역검색 API 는 좌표를 안 받는다. 파라미터가
 * `query` / `display` 뿐이라 "내 근처에서 찾아줘" 를 요청할 방법이 없고,
 * 그냥 "써브웨이" 로 치면 전국 기준 인기순이라 시청 근처 것들이 올라온다.
 * 그래서 **검색어에 지역명을 붙이는 것**이 유일한 수단이다 (SPEC §4.4).
 *
 * **왜 하나가 아니라 목록인가** (2026-08-10): 동은 몇백 미터짜리라, 길 건너
 * 옆 동에 있는 가게는 질의에서 통째로 빠진다. 경복궁역에서 "써브웨이" 를 쳤는데
 * 경복궁점이 안 나오고 종로점이 먼저 나온 게 그 증상이었다. 구까지 함께 넘겨서
 * 넓은 그물도 같이 던진다 — 5건 제한이 질의마다 따로 걸리므로, 질의가 둘이면
 * 후보도 두 배가 된다.
 *
 * 지도 SDK 를 `submodules=geocoder` 로 이미 싣고 있어서 키가 더 필요하지 않다.
 *
 * **실패하면 빈 배열이다.** NCP 애플리케이션에 Reverse Geocoding 이 안 켜져
 * 있으면 여기서 막히는데, 그때는 지역명 없이 검색하면 된다 — 예전과 같은
 * 동작이다. 등록을 막을 이유가 전혀 없다.
 */
export async function areaNamesOf(center: LatLng): Promise<string[]> {
  if (typeof window === "undefined") return [];
  const service = window.naver?.maps?.Service;
  if (!service?.reverseGeocode) return [];

  return new Promise((resolve) => {
    // 콜백 API 라 응답이 영영 안 올 수도 있다. 검색을 붙잡아 두지 않는다.
    const timer = setTimeout(() => resolve([]), 3000);
    const done = (v: string[]) => {
      clearTimeout(timer);
      resolve(v);
    };

    try {
      service.reverseGeocode(
        {
          coords: new window.naver.maps.LatLng(center.lat, center.lng),
          orders: "addr", // 지번 주소. 가게 주소도 지번 기준이라 결이 같다
        },
        (status: unknown, response: unknown) => {
          if (status !== service.Status.OK) return done([]);
          done(pickAreas(response));
        },
      );
    } catch {
      done([]);
    }
  });
}

/**
 * 응답에서 "구 + 동" 과 "구" 를 뽑는다. **좁은 것이 먼저다.**
 *
 * 시/도까지 붙이면 질의가 길어져서 오히려 결과가 줄어든다. 반대로 동만 쓰면
 * 같은 이름의 동이 여러 시에 있어서 엉뚱한 데가 나온다. 구+동이 절충점이고,
 * 구 하나짜리는 그 옆 동까지 덮는 보험이다.
 */
function pickAreas(response: unknown): string[] {
  const results = get(get(response, "v2"), "results");
  if (!Array.isArray(results) || results.length === 0) return [];

  const region = get(results[0], "region");
  const area2 = str(get(get(region, "area2"), "name")); // 시군구
  const area3 = str(get(get(region, "area3"), "name")); // 읍면동

  if (!area2) return area3 ? [area3] : [];
  return area3 ? [`${area2} ${area3}`, area2] : [area2];
}

function get(v: unknown, key: string): unknown {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)[key]
    : undefined;
}
function str(v: unknown) {
  return typeof v === "string" && v.length > 0 ? v : null;
}
