// 네이버 지역검색 — 서버 전용 (SPEC §4.4 / WBS 5.1).
//
// **이 파일은 클라이언트에서 import 하지 않는다.** secret 을 읽는다.
// 브라우저는 /api/places/search 라우트만 호출한다.

/**
 * NAVER API HUB(NCP 중개). 예전 개발자센터 주소가 아니다 — SPEC §4.4 표 참고.
 *   openapi.naver.com/v1/search/local.json → naverapihub.apigw.ntruss.com/search/v1/local
 */
const ENDPOINT =
  // 검증에서만 가짜 업스트림으로 바꿔 끼운다. 배포 환경에는 이 변수가 없다.
  process.env.NAVER_SEARCH_ENDPOINT ??
  "https://naverapihub.apigw.ntruss.com/search/v1/local";

/** 이 API 는 5건까지만 준다. 더 달라고 해도 5건이다 (SPEC §4.4) */
export const MAX_RESULTS = 5;

export type PlaceCandidate = {
  name: string;
  category: string;
  address: string;
  roadAddress: string;
  telephone: string;
  lat: number;
  lng: number;
  link: string;
};

export class LocalSearchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * `mapx`/`mapy` → WGS84.
 *
 * SPEC 은 10^7 배 정수라고 적어뒀지만 과거에 KATECH 좌표였던 이력이 있어서
 * 값의 자릿수를 보고 스케일을 정한다. 한국 경도는 124~132, 위도는 33~39 라
 * 스케일을 잘못 잡으면 결과가 그 범위 밖으로 나간다 — 그때는 버린다.
 * 잘못된 좌표로 맛집을 등록하면 지도에 엉뚱한 곳이 박히고, 되돌리기 어렵다.
 */
function toWgs84(
  mapx: unknown,
  mapy: unknown,
): { lat: number; lng: number } | null {
  const x = Number(mapx);
  const y = Number(mapy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // 10^7 배(SPEC) → 10^6 배(구형) → 원본 순으로 시도한다.
  for (const scale of [1e7, 1e6, 1]) {
    const lng = x / scale;
    const lat = y / scale;
    if (lng >= 124 && lng <= 132 && lat >= 33 && lat <= 39) return { lat, lng };
  }
  return null; // KATECH 등 다른 좌표계. 여기서 만들어내지 않는다.
}

/** 네이버는 검색어에 `<b>` 를 붙여서 준다. 그대로 렌더하면 마크업이 새어 나온다. */
function stripTags(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function toCandidate(row: unknown): PlaceCandidate | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const name = stripTags(r.title);
  if (!name) return null;

  const coords = toWgs84(r.mapx, r.mapy);
  if (!coords) return null; // 좌표를 못 믿으면 후보에서 뺀다

  return {
    name,
    category: stripTags(r.category),
    address: stripTags(r.address),
    roadAddress: stripTags(r.roadAddress),
    telephone: stripTags(r.telephone),
    link: typeof r.link === "string" ? r.link : "",
    ...coords,
  };
}

/** 합쳐서 이만큼까지. 질의 3개 × 5건 = 15 가 상한이다 */
const MAX_MERGED = 15;

/**
 * 상호 검색.
 *
 * **이 API 는 좌표를 안 받는다.** 파라미터가 `query` / `display` 뿐이라
 * "내 근처에서 찾아줘" 를 요청할 방법이 없고, 그냥 "써브웨이" 로 치면 전국 기준
 * 인기순이라 시청 근처 것들이 올라온다. 그래서 `areas`(["광진구 구의동", "광진구"])
 * 를 받아 **검색어 앞에 붙인다.** 그게 근처로 좁히는 유일한 수단이다.
 *
 * **여러 질의를 던지고 합친다** (2026-08-10). 예전에는 좁은 질의가 1건이라도
 * 물어오면 거기서 끝냈는데, 그 방식은 5건 제한과 만나면 조용히 후보를 잃는다.
 * 경복궁역에서 "써브웨이" 를 쳤을 때 경복궁점이 아예 안 나오고 종로점이 먼저
 * 나온 게 그 증상이었다 — 질의에 "종로구" 가 들어가니 이름에 '종로' 가 붙은
 * 지점들이 5칸을 먼저 채웠고, 옆 동에 있는 경복궁점은 들어올 자리가 없었다.
 *
 * **5건 제한은 질의마다 따로 걸린다.** 그래서 좁은 그물(동)·넓은 그물(구)·
 * 맨 질의를 동시에 던져서 각각 5칸씩 받아 합친다. 무엇이 가까운지는 화면이
 * 거리순으로 세워서 판단한다 — 멀리서 딸려온 것은 알아서 아래로 내려간다.
 *
 * 한 질의가 실패해도 나머지로 답한다. **전부 실패했을 때만** 이유를 올린다 —
 * 그래야 429/503 이 화면의 안내로 이어진다.
 */
export async function searchLocal(
  query: string,
  areas: readonly string[] = [],
): Promise<PlaceCandidate[]> {
  // 맨 질의는 항상 넣는다. 체인점은 상호에 지역이 안 붙어서, 지역명을 붙이면
  // 오히려 안 걸리는 경우가 있다.
  const queries = [...areas.map((a) => `${a} ${query}`), query];
  const settled = await Promise.allSettled(queries.map((q) => callSearch(q)));

  const ok = settled.filter(
    (r): r is PromiseFulfilledResult<PlaceCandidate[]> =>
      r.status === "fulfilled",
  );
  if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason;

  // 같은 가게가 여러 질의에서 온다. 이름 + 좌표 소수 4자리(약 11m)로 묶는다 —
  // 서로 다른 지점이 11m 안에 겹치는 일은 없다.
  const seen = new Set<string>();
  const merged: PlaceCandidate[] = [];
  for (const r of ok) {
    for (const p of r.value) {
      const key = `${p.name.toLowerCase()}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(p);
      if (merged.length >= MAX_MERGED) return merged;
    }
  }
  return merged;
}

async function callSearch(query: string): Promise<PlaceCandidate[]> {
  const id = process.env.NAVER_SEARCH_CLIENT_ID;
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new LocalSearchError("검색 키가 설정되지 않았다", 503);
  }

  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=${MAX_RESULTS}`;
  const res = await fetch(url, {
    headers: {
      // 이름은 Client ID/Secret 인데 헤더는 NCP 게이트웨이 규약이다 (SPEC §4.4)
      "X-NCP-APIGW-API-KEY-ID": id,
      "X-NCP-APIGW-API-KEY": secret,
    },
    // 같은 상호를 여러 명이 검색한다. 짧게 캐시해서 쿼터를 아낀다.
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    // 상태 코드를 그대로 흘리지 않는다 — 429/401 이 그대로 나가면 화면이 원인을
    // 잘못 안내한다. 로그는 서버에 남기고 밖으로는 뭉뚱그린다.
    console.error(
      `지역검색 실패: ${res.status} ${await res.text().catch(() => "")}`,
    );
    throw new LocalSearchError(
      "지역검색을 부르지 못했다",
      res.status === 429 ? 429 : 502,
    );
  }

  const body: unknown = await res.json();
  const items =
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: unknown[] }).items
      : [];

  return items
    .map(toCandidate)
    .filter((p): p is PlaceCandidate => p !== null)
    .slice(0, MAX_RESULTS);
}
