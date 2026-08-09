import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * service_role 클라이언트 — **서버 라우트 전용.**
 *
 * 이 키는 RLS 를 통째로 무시한다. 브라우저로 새면 아무나 남의 리뷰를 지울 수 있다.
 * 그래서 `NEXT_PUBLIC_` 접두사가 없고, import 하는 파일도 서버에서만 도는 것이어야
 * 한다 (`src/app/api/admin/*`). 클라이언트 컴포넌트에서 부르지 말 것.
 *
 * 관리자 화면이 이 키를 쓰는 이유: 리뷰·맛집 수정/삭제는 RLS 상 **작성자 본인만**
 * 할 수 있고 (SPEC §2.3), 카테고리는 update/delete 정책이 아예 없다. 관리자는
 * 남의 것을 고쳐야 하므로 정책 안에서는 방법이 없다. 대신 관문을 서버에 둔다 —
 * 비밀번호를 통과한 요청만 이 클라이언트에 닿는다.
 */

let client: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    // 서버에는 로그인한 사람이 없다. 세션을 저장하거나 갱신할 이유가 없고,
    // 켜 두면 서버 인스턴스가 남의 세션을 들고 있게 된다.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
