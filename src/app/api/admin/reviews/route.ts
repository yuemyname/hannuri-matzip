import { NextResponse } from "next/server";
import { badRequest, guard, readBody } from "../guard";

export const runtime = "nodejs";

/** 한 번에 보여줄 리뷰 수. 사내 규모라 최근 것만 있으면 충분하다 */
const PAGE = 50;

/** 최근 리뷰 목록. 어느 맛집 것인지 같이 준다 — 이름 없이는 뭘 고치는지 모른다 */
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const { data, error } = await g.supabase
    .from("reviews")
    .select(
      "id, rating, comment, visited_on, created_at, user_id, restaurant_id, restaurants(name)",
    )
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reviews: data ?? [] });
}

/** 별점·코멘트 수정 */
export async function PATCH(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  if (!body) return badRequest("요청 형식이 올바르지 않아요");

  const id = body.id;
  if (typeof id !== "string" || id.length === 0) return badRequest("id 가 없어요");

  const patch: { rating?: number; comment?: string | null } = {};
  if (body.rating !== undefined) {
    const rating = Number(body.rating);
    // DB check 와 같은 범위다. 여기서 안 막으면 500 이 나가고 화면은 이유를 모른다.
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return badRequest("별점은 1~5 여야 해요");
    patch.rating = rating;
  }
  if (body.comment !== undefined) {
    if (body.comment !== null && typeof body.comment !== "string")
      return badRequest("코멘트 형식이 올바르지 않아요");
    const text = typeof body.comment === "string" ? body.comment.trim() : "";
    patch.comment = text.length > 0 ? text : null;
  }
  if (Object.keys(patch).length === 0) return badRequest("고칠 내용이 없어요");

  const { error } = await g.supabase.from("reviews").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** 리뷰 삭제. 사진은 cascade 로 함께 지워진다 */
export async function DELETE(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  const id = body?.id;
  if (typeof id !== "string" || id.length === 0) return badRequest("id 가 없어요");

  const { error } = await g.supabase.from("reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
