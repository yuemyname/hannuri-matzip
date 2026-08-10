import { NextResponse } from "next/server";
import { LocalSearchError, searchLocal } from "@/lib/naver/local-search";

/**
 * 지역검색 프록시 (WBS 5.1).
 *
 * **이 라우트가 있는 이유는 시크릿 때문이다.** 브라우저에서 직접 부르면
 * `X-NCP-APIGW-API-KEY` 가 노출된다. 그래서 키는 여기서만 읽는다.
 *
 * WBS 는 POST 로 적어뒀다. 검색어가 URL·리퍼러·프록시 로그에 남지 않는 편이
 * 낫고, 브라우저가 멋대로 캐시하지도 않는다.
 */
export const runtime = "nodejs";

const MAX_QUERY_LEN = 60;
/** 지역명은 두 개까지 (동·구). 늘리면 그만큼 업스트림 호출이 늘어난다 */
const MAX_AREAS = 2;
const MAX_AREA_LEN = 30;

/**
 * 지역명 정리. 길거나 이상한 값이 그대로 질의에 붙지 않게 여기서 자른다.
 * **개수도 여기서 막는다** — 하나가 곧 업스트림 호출 하나라, 안 막으면 클라이언트가
 * 원하는 만큼 쿼터를 태울 수 있다.
 */
function cleanAreas(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const area = v.trim().slice(0, MAX_AREA_LEN);
    if (area.length === 0 || out.includes(area)) continue;
    out.push(area);
    if (out.length >= MAX_AREAS) break;
  }
  return out;
}

export async function POST(request: Request) {
  let query: unknown;
  let areas: unknown;
  try {
    const body: unknown = await request.json();
    const rec =
      typeof body === "object" && body !== null
        ? (body as { query?: unknown; areas?: unknown })
        : null;
    query = rec?.query ?? null;
    // 클라이언트가 역지오코딩으로 얻은 지역명, 좁은 것부터
    // (["광진구 구의동", "광진구"]). 이 API 는 좌표를 못 받아서, 근처로 좁히는
    // 유일한 수단이 검색어에 붙이는 것이다.
    areas = rec?.areas ?? null;
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않아요" },
      { status: 400 },
    );
  }

  if (typeof query !== "string" || query.trim().length < 2) {
    // 한 글자로는 쓸 만한 결과가 안 나온다. 쿼터만 쓴다.
    return NextResponse.json(
      { error: "두 글자 이상 입력해 주세요" },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY_LEN) {
    return NextResponse.json(
      { error: "검색어가 너무 길어요" },
      { status: 400 },
    );
  }

  try {
    const places = await searchLocal(query.trim(), cleanAreas(areas));
    return NextResponse.json({ places });
  } catch (e) {
    const status = e instanceof LocalSearchError ? e.status : 502;
    // 문구는 사과하지 않고 다음 행동을 알려준다 (CLAUDE.md).
    // 키가 없을 때(503)는 등록 자체는 수동으로 계속할 수 있다는 걸 알린다.
    const message =
      status === 503
        ? "검색을 쓸 수 없어요. 이름과 위치를 직접 입력해 주세요."
        : status === 429
          ? "검색이 잠시 막혔어요. 조금 뒤에 다시 시도해 주세요."
          : "검색하지 못했어요. 직접 입력해도 등록할 수 있어요.";
    return NextResponse.json({ error: message }, { status });
  }
}
