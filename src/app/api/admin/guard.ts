import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { ADMIN_COOKIE, adminConfigured, verifyToken } from "@/lib/admin/session";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관리자 라우트의 공통 관문.
 *
 * **모든 관리자 라우트는 첫 줄에서 이걸 부른다.** service_role 키는 RLS 를 통째로
 * 무시하므로, 여기를 안 지나는 경로가 하나라도 생기면 그게 곧 구멍이다.
 *
 * 통과하면 service_role 클라이언트를 준다. 막히면 그대로 돌려줄 응답을 준다 —
 * 호출부가 상태 코드를 다시 정하지 않게 해서 실수로 200 을 주는 일을 막는다.
 */
export type Guarded =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

export async function guard(): Promise<Guarded> {
  // 비밀번호를 안 걸어 뒀으면 관리자 기능 자체가 없다. "틀렸다" 가 아니라
  // "없다" 로 답한다 — 있는데 못 여는 것과 아예 없는 것은 다른 상황이다.
  if (!adminConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "관리자 기능이 꺼져 있어요" },
        { status: 404 },
      ),
    };
  }

  const jar = await cookies();
  if (!verifyToken(jar.get(ADMIN_COOKIE)?.value)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "다시 로그인해 주세요" },
        { status: 401 },
      ),
    };
  }

  const supabase = getAdminSupabase();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "서버에 SUPABASE_SERVICE_ROLE_KEY 가 없어요" },
        { status: 500 },
      ),
    };
  }

  return { ok: true, supabase };
}

/** 본문을 객체로 읽는다. 형식이 틀리면 null — 호출부가 400 을 준다 */
export async function readBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body))
      return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });
