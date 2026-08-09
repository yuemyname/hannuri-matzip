import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 관리자 인증 — **공용 비밀번호 한 개.**
 *
 * 이 앱에는 신원이 없다 (SPEC §2.4: 익명 세션, 로그인 UI 없음). 그래서 "누가
 * 관리자인가" 를 물을 데가 없고, 대신 "비밀번호를 아는 사람" 으로 정했다.
 * 사내 툴이라 이 정도가 값에 맞는다 — 계정 관리를 들이면 익명 세션 전제가 깨지고
 * 리뷰 소유권·내 정보 화면까지 다시 손봐야 한다.
 *
 * **비밀번호는 서버에서만 읽는다.** `NEXT_PUBLIC_` 을 붙이면 그 순간 번들에 박힌다.
 *
 * 쿠키에는 비밀번호를 넣지 않는다. 만료 시각과 그 서명만 넣는다 — 쿠키가 새도
 * 비밀번호 자체는 안 새고, 서명 검증에 비밀번호가 필요해서 위조도 못 한다.
 */

export const ADMIN_COOKIE = "hannuri_admin";

/** 한 번 들어오면 이만큼 유지한다. 사내 자리에서 잠깐 고치는 용도라 길지 않다 */
const TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string | null {
  const v = process.env.ADMIN_PASSWORD;
  return v && v.length > 0 ? v : null;
}

/** 관리자 기능을 켤 수 있는 상태인가. 비밀번호가 없으면 화면 자체를 잠근다 */
export function adminConfigured(): boolean {
  return secret() !== null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/** 길이가 달라도 안전하게 비교한다. 같은 길이일 때만 timingSafeEqual 이 통한다 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 비밀번호가 맞으면 쿠키 값을 만든다. 틀리면 null */
export function issueToken(password: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  // **비교도 상수 시간으로.** 틀린 비밀번호를 한 글자씩 맞춰 가는 걸 막는다.
  if (!safeEqual(password, key)) return null;
  const exp = String(now + TTL_MS);
  return `${exp}.${sign(exp, key)}`;
}

/** 쿠키 값이 아직 유효한가 */
export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  const key = secret();
  if (!key || !token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(exp, key))) return false;
  const at = Number(exp);
  return Number.isFinite(at) && at > now;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: TTL_MS / 1000,
  // 배포는 https 다. 로컬 http 개발에서도 쿠키가 붙도록 프로덕션에서만 켠다.
  secure: process.env.NODE_ENV === "production",
} as const;
