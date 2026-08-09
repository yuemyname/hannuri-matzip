import { NextResponse } from "next/server";
import { isMood, type Mood } from "@/lib/moods";
import {
  normalizeReservationUrl,
  reservationUrlError,
} from "@/lib/reservation";
import { badRequest, guard, readBody } from "../guard";

export const runtime = "nodejs";

const PAGE = 200;

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const { data, error } = await g.supabase
    .from("restaurants")
    .select(
      "id, name, category, road_address, price_range, memo, mood_tags, reservable, reservation_url, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ restaurants: data ?? [] });
}

/** 이름·종류·가격대·메모 수정. 좌표는 안 건드린다 — 지도에서 옮길 일이라 폼이 다르다 */
export async function PATCH(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  if (!body) return badRequest("요청 형식이 올바르지 않아요");
  const id = body.id;
  if (typeof id !== "string" || id.length === 0) return badRequest("id 가 없어요");

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") return badRequest("이름 형식이 올바르지 않아요");
    const name = body.name.trim();
    if (name.length === 0) return badRequest("이름을 비울 수 없어요");
    patch.name = name;
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string" || body.category.length === 0)
      return badRequest("종류가 올바르지 않아요");
    // 목록에 없는 종류면 외래키가 막는다. 그 에러는 그대로 올려서 화면이 이유를 말한다.
    patch.category = body.category;
  }
  if (body.priceRange !== undefined) {
    if (body.priceRange === null) patch.price_range = null;
    else {
      const p = Number(body.priceRange);
      if (!Number.isInteger(p) || p < 1 || p > 4)
        return badRequest("가격대는 1~4 여야 해요");
      patch.price_range = p;
    }
  }
  if (body.moodTags !== undefined) {
    if (!Array.isArray(body.moodTags) || !body.moodTags.every(isMood))
      return badRequest("모르는 상황 태그예요");
    // 같은 값이 두 번 들어가도 DB 제약은 통과하지만, 화면에 두 번 뜬다.
    patch.mood_tags = [...new Set(body.moodTags as Mood[])];
  }
  if (body.reservable !== undefined) {
    if (typeof body.reservable !== "boolean")
      return badRequest("예약 여부가 올바르지 않아요");
    patch.reservable = body.reservable;
  }
  if (body.reservationUrl !== undefined) {
    if (body.reservationUrl !== null && typeof body.reservationUrl !== "string")
      return badRequest("예약 링크 형식이 올바르지 않아요");
    const raw = typeof body.reservationUrl === "string" ? body.reservationUrl : "";
    // 화면과 **같은 규칙**으로 본다. 여기가 갈라지면 관리자 화면은 통과시키는데
    // DB 제약이 거부하고, 이유는 "500" 으로만 보인다.
    const problem = reservationUrlError(raw);
    if (problem) return badRequest(problem);
    patch.reservation_url = normalizeReservationUrl(raw);
  }
  if (body.memo !== undefined) {
    if (body.memo !== null && typeof body.memo !== "string")
      return badRequest("메모 형식이 올바르지 않아요");
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    patch.memo = memo.length > 0 ? memo : null;
  }
  if (Object.keys(patch).length === 0) return badRequest("고칠 내용이 없어요");

  patch.updated_at = new Date().toISOString();
  const { error } = await g.supabase
    .from("restaurants")
    .update(patch)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * 맛집 삭제. 달린 리뷰·메뉴·추천기록도 cascade 로 함께 사라진다.
 * 되돌릴 수 없으므로 화면이 확인 대화상자를 한 번 세운다.
 */
export async function DELETE(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  const id = body?.id;
  if (typeof id !== "string" || id.length === 0) return badRequest("id 가 없어요");

  const { error } = await g.supabase.from("restaurants").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
