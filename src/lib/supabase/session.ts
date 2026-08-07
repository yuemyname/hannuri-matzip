"use client";

import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./client";

// 익명 세션 부트스트랩 — SPEC §2.4.
//
// 로그인 화면이 없다. 사용자는 인증이 있다는 사실 자체를 몰라야 한다.
// 그래서 여기서 나는 에러는 화면에 올리지 않는다. 조용히 다시 시도한다.
//
// **단일 프로미스로 감싼다.** 동시에 여러 번 부르면 익명 세션이 그만큼 발급되고,
// 그러면 방금 남긴 리뷰가 다음 새로고침에 남의 것이 된다.
// 측정해 보면 이 줄 하나가 정확히 그 차이다 — 동시 5회 호출에
// 가드가 있으면 signInAnonymously 1회, 없으면 5회 나간다.
// supabase-js 내부 락은 여기까지 막아 주지 않는다.
//
// 지금은 부트스트랩 한 곳만 부르지만, P2 에서 조회 훅들이 각자 세션을 기다리기
// 시작하면 동시 호출이 기본이 된다. 그때 고치면 늦다.

let pending: Promise<Session | null> | null = null;

export function ensureSession(): Promise<Session | null> {
  pending ??= start();
  return pending;
}

async function start(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null; // .env.local 미설정. 여기서 죽이지 않는다.

  try {
    // 저장된 세션이 있으면 그대로 쓴다. 만료됐으면 라이브러리가 갱신한다.
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;

    const { data: created, error: signInError } =
      await supabase.auth.signInAnonymously();
    if (signInError) throw signInError;
    return created.session;
  } catch {
    // 실패를 캐시하면 이 탭은 영영 세션을 못 받는다. 다음 호출이 다시 시도하게 푼다.
    pending = null;
    return null;
  }
}

/** 테스트·로그아웃 등으로 세션을 갈아끼울 때 캐시를 비운다. */
export function resetSessionCache() {
  pending = null;
}
