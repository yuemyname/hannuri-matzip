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

export async function searchLocal(query: string): Promise<PlaceCandidate[]> {
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
