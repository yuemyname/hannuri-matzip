import { NextResponse } from "next/server";
import { badRequest, guard, readBody } from "../guard";

export const runtime = "nodejs";

const PAGE = 200;

/**
 * 피드백 읽기 — **이 라우트가 유일한 읽는 길이다.**
 *
 * `feedback` 에는 select 정책이 아예 없다 (마이그레이션 참고). 그래서 anon 키로는
 * 누구도 남의 피드백을 못 읽고, service_role 을 쓰는 여기만 읽는다.
 * 다른 관리자 라우트와 마찬가지로 **첫 줄에서 guard()** 를 부른다.
 */
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const { data, error } = await g.supabase
    .from("feedback")
    .select("id, body, resolved, created_at")
    // 안 본 것이 위로. 그다음 최근 순 — 쌓이기 시작하면 이 순서가 곧 할 일 목록이다.
    .order("resolved", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ feedback: data ?? [] });
}

/** 봤음/안 봤음 표시. 내용은 안 고친다 — 남이 쓴 말이라 고칠 이유가 없다 */
export async function PATCH(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  if (!body) return badRequest("요청 형식이 올바르지 않아요");
  const id = body.id;
  if (typeof id !== "string" || id.length === 0) return badRequest("id 가 없어요");
  if (typeof body.resolved !== "boolean")
    return badRequest("처리 여부가 올바르지 않아요");

  const { error } = await g.supabase
    .from("feedback")
    .update({ resolved: body.resolved })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * 지우기. 되돌릴 수 없으므로 화면이 확인 대화상자를 한 번 세운다.
 * 처리 표시와 다른 동작이다 — 지우면 같은 말이 또 왔을 때 예전에 들었는지 모른다.
 */
export async function DELETE(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  const id = body?.id;
  if (typeof id !== "string" || id.length === 0) return badRequest("id 가 없어요");

  const { error } = await g.supabase.from("feedback").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
