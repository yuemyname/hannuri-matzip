/**
 * 클래스 문자열 합치기. falsy 는 버린다.
 *
 * clsx / tailwind-merge 를 쓰지 않는다 — 의존성을 늘리는 대신, 호출부가 넘기는
 * className 이 기본값과 충돌하지 않게 두는 쪽을 택했다. 충돌이 실제로 문제가 되면
 * 그때 tailwind-merge 를 들이는 게 맞다.
 */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
