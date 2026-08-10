"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";

/** 마이그레이션의 `feedback_body_len` 과 같은 뜻이어야 한다 */
export const FEEDBACK_MAX_LEN = 1000;

/** 못 보낼 글이면 이유를, 보낼 수 있으면 null */
export function feedbackError(raw: string): string | null {
  const body = raw.trim();
  if (body.length === 0) return "내용을 적어 주세요";
  if (body.length > FEEDBACK_MAX_LEN)
    return `${FEEDBACK_MAX_LEN}자까지 쓸 수 있어요`;
  return null;
}

/**
 * 피드백 보내기.
 *
 * **누가 썼는지 안 보낸다** (SPEC §4.7). 익명 세션 id 를 붙여 봐야 답장에 못
 * 쓰면서 "누가 이런 말 했나" 만 볼 수 있게 된다. 세션은 RLS 통과용으로만 있으면
 * 된다 — insert 정책이 `to authenticated` 라 세션 자체는 있어야 한다.
 */
export async function sendFeedback(body: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase 설정이 없다");
  await ensureSession();

  const { error } = await supabase
    .from("feedback")
    .insert({ body: body.trim() });
  if (error) throw error;
}
