"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 브라우저 전용 싱글턴.
//
// 서버에서는 쓰지 않는다. 세션은 브라우저에 저장되고(SPEC §2.4) 데이터 조회도
// 전부 클라이언트에서 한다. 서버 라우트가 필요해지면 service role 키로 별도
// 클라이언트를 만든다 — 그 키는 절대 여기로 오면 안 된다.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

/** 환경변수가 없으면 null. 호출부가 조용히 넘어갈 수 있게 던지지 않는다. */
export function getSupabase(): SupabaseClient | null {
  if (!URL || !ANON_KEY) return null;
  client ??= createClient(URL, ANON_KEY, {
    auth: {
      // 세션을 localStorage 에 두고 만료 전에 알아서 갱신한다.
      persistSession: true,
      autoRefreshToken: true,
      // 이메일 링크로 돌아오는 흐름이 없다. URL 파싱을 켜 둘 이유가 없다.
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** .env.local 이 안 채워진 상태를 화면에서 구분하려고 쓴다. */
export const isSupabaseConfigured = Boolean(URL && ANON_KEY);
