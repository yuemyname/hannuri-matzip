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

export async function POST(request: Request) {
  let query: unknown;
  try {
    const body: unknown = await request.json();
    query =
      typeof body === "object" && body !== null
        ? (body as { query?: unknown }).query
        : null;
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
    const places = await searchLocal(query.trim());
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
