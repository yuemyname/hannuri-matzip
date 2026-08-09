"use client";

import type { LatLng } from "./map-store";

/**
 * 좌표 → 행정동 이름 (예: "광진구 구의동").
 *
 * **왜 필요한가**: 네이버 지역검색 API 는 좌표를 안 받는다. 파라미터가
 * `query` / `display` 뿐이라 "내 근처에서 찾아줘" 를 요청할 방법이 없고,
 * 그냥 "써브웨이" 로 치면 전국 기준 인기순이라 시청 근처 것들이 올라온다.
 * 그래서 **검색어에 지역명을 붙이는 것**이 유일한 수단이다 (SPEC §4.4).
 *
 * 지도 SDK 를 `submodules=geocoder` 로 이미 싣고 있어서 키가 더 필요하지 않다.
 *
 * **실패하면 null 이다.** NCP 애플리케이션에 Reverse Geocoding 이 안 켜져 있으면
 * 여기서 막히는데, 그때는 지역명 없이 검색하면 된다 — 예전과 같은 동작이다.
 * 등록을 막을 이유가 전혀 없다.
 */
export async function areaNameOf(center: LatLng): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const service = window.naver?.maps?.Service;
  if (!service?.reverseGeocode) return null;

  return new Promise((resolve) => {
    // 콜백 API 라 응답이 영영 안 올 수도 있다. 검색을 붙잡아 두지 않는다.
    const timer = setTimeout(() => resolve(null), 3000);
    const done = (v: string | null) => {
      clearTimeout(timer);
      resolve(v);
    };

    try {
      service.reverseGeocode(
        {
          coords: new window.naver.maps.LatLng(center.lat, center.lng),
          orders: "addr", // 지번 주소. 행정동이 여기 들어 있다
        },
        (status: unknown, response: unknown) => {
          if (status !== service.Status.OK) return done(null);
          done(pickArea(response));
        },
      );
    } catch {
      done(null);
    }
  });
}

/**
 * 응답에서 "구 + 동" 만 뽑는다.
 *
 * 시/도까지 붙이면 질의가 길어져서 오히려 결과가 줄어든다. 반대로 동만 쓰면
 * 같은 이름의 동이 여러 시에 있어서 엉뚱한 데가 나온다. 구+동이 절충점이다.
 */
function pickArea(response: unknown): string | null {
  const results = get(get(response, "v2"), "results");
  if (!Array.isArray(results) || results.length === 0) return null;

  const region = get(results[0], "region");
  const area2 = str(get(get(region, "area2"), "name")); // 시군구
  const area3 = str(get(get(region, "area3"), "name")); // 읍면동

  const parts = [area2, area3].filter((v): v is string => !!v);
  return parts.length > 0 ? parts.join(" ") : null;
}

function get(v: unknown, key: string): unknown {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)[key]
    : undefined;
}
function str(v: unknown) {
  return typeof v === "string" && v.length > 0 ? v : null;
}
