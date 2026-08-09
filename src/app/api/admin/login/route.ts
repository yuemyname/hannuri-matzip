import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  COOKIE_OPTIONS,
  adminConfigured,
  issueToken,
  verifyToken,
} from "@/lib/admin/session";

export const runtime = "nodejs";

/** 지금 관리자로 들어와 있는지. 화면이 로그인 폼을 띄울지 판단하는 데 쓴다 */
export async function GET() {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "관리자 기능이 꺼져 있어요" },
      { status: 404 },
    );
  }
  const jar = await cookies();
  return NextResponse.json({ ok: verifyToken(jar.get(ADMIN_COOKIE)?.value) });
}

/**
 * 로그인. 비밀번호가 맞으면 httpOnly 쿠키를 심는다.
 *
 * **비밀번호는 쿠키에 안 들어간다** — 만료 시각과 그 서명만 들어간다.
 * 서명 검증에 비밀번호가 필요해서 위조도 못 하고, 쿠키가 새도 비밀번호는 안 샌다.
 */
export async function POST(request: Request) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "관리자 기능이 꺼져 있어요" },
      { status: 404 },
    );
  }

  let password: unknown;
  try {
    const body: unknown = await request.json();
    password =
      typeof body === "object" && body !== null
        ? (body as { password?: unknown }).password
        : null;
  } catch {
    password = null;
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "비밀번호를 입력해 주세요" }, { status: 400 });
  }

  const token = issueToken(password);
  if (!token) {
    // 왜 틀렸는지 알려주지 않는다. 길이·형식을 흘리면 맞춰 보기가 쉬워진다.
    return NextResponse.json({ error: "비밀번호가 달라요" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, COOKIE_OPTIONS);
  return res;
}

/** 로그아웃 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
