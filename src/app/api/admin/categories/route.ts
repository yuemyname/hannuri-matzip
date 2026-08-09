import { NextResponse } from "next/server";
import { categoryError, normalizeCategory } from "@/lib/categories";
import { badRequest, guard, readBody } from "../guard";

export const runtime = "nodejs";

/** 목록 + 각 종류에 붙은 맛집 수. 개수를 알아야 "지워도 되는지" 를 판단한다 */
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const [cats, uses] = await Promise.all([
    g.supabase
      .from("categories")
      .select("name, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    g.supabase.from("restaurants").select("category"),
  ]);
  if (cats.error)
    return NextResponse.json({ error: cats.error.message }, { status: 500 });
  if (uses.error)
    return NextResponse.json({ error: uses.error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of uses.data ?? []) {
    const c = (row as { category: string }).category;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  return NextResponse.json({
    categories: (cats.data ?? []).map((c) => {
      const row = c as { name: string; sort_order: number };
      return { ...row, usedBy: counts.get(row.name) ?? 0 };
    }),
  });
}

/** 새 종류 추가 */
export async function POST(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  if (typeof body?.name !== "string") return badRequest("이름이 없어요");
  const name = normalizeCategory(body.name);
  // 폼과 DB 제약이 같은 규칙이다. 여기서도 같은 함수를 쓴다 — 세 곳이 갈라지면
  // 어디선 되고 어디선 안 되는 이름이 생긴다.
  const problem = categoryError(name);
  if (problem) return badRequest(problem);

  const { error } = await g.supabase.from("categories").insert({ name });
  if (error) {
    if (error.code === "23505")
      return badRequest("이미 있는 종류예요");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * 이름 바꾸기.
 *
 * `on update cascade` 라 붙어 있던 맛집이 알아서 따라온다 — 여기서 맛집을 훑으며
 * 고칠 필요가 없고, 중간에 실패해 반만 바뀌는 상태도 안 생긴다.
 */
export async function PATCH(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  if (typeof body?.name !== "string" || typeof body?.to !== "string")
    return badRequest("바꿀 이름이 없어요");

  const to = normalizeCategory(body.to);
  const problem = categoryError(to);
  if (problem) return badRequest(problem);
  if (to === body.name) return NextResponse.json({ ok: true });

  const { error } = await g.supabase
    .from("categories")
    .update({ name: to })
    .eq("name", body.name);
  if (error) {
    if (error.code === "23505") return badRequest("이미 있는 종류예요");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * 종류 삭제.
 *
 * `on delete restrict` 라 쓰이는 중이면 DB 가 막는다. 그걸 그대로 500 으로 흘리지
 * 않고 "먼저 옮겨 주세요" 로 번역한다 — 화면이 다음에 뭘 해야 하는지 알아야 한다.
 */
export async function DELETE(request: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const body = await readBody(request);
  if (typeof body?.name !== "string") return badRequest("이름이 없어요");

  const { error } = await g.supabase
    .from("categories")
    .delete()
    .eq("name", body.name);
  if (error) {
    if (error.code === "23503")
      return badRequest(
        "이 종류를 쓰는 맛집이 있어요. 먼저 다른 종류로 옮겨 주세요",
      );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
