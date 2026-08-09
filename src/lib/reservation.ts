/**
 * 예약 링크 규칙.
 *
 * 사람이 붙여넣는 값이 그대로 `<a href>` 가 된다. `javascript:` 나 `data:` 가
 * 들어오면 클릭 한 번에 스크립트가 도는 자리다. 화면에서 한 번, DB 제약에서 한 번
 * 막는다 — **입력 경로가 등록 폼·관리자 화면 둘이라, 화면 한 곳만 막으면 뚫린다.**
 *
 * 규칙은 마이그레이션의 `restaurants_reservation_url_scheme` 와 같은 뜻이어야 한다.
 */

export const RESERVATION_URL_MAX_LEN = 500;

/** 못 쓰는 링크면 이유를 돌려준다. 쓸 수 있으면 null */
export function reservationUrlError(raw: string): string | null {
  const url = raw.trim();
  if (url.length === 0) return null; // 빈 값은 "링크 없음" 이지 오류가 아니다
  if (url.length > RESERVATION_URL_MAX_LEN) return "링크가 너무 길어요";
  // 공백이 섞이면 뒤가 잘려 엉뚱한 데로 간다.
  if (/\s/.test(url)) return "링크에 공백이 있어요";
  if (!/^https?:\/\/[^\s]+$/.test(url))
    return "http:// 또는 https:// 로 시작하는 주소여야 해요";
  return null;
}

/** 저장할 꼴로. 빈 값은 null 이다 — 빈 문자열을 넣으면 "링크 있음" 으로 읽힌다 */
export function normalizeReservationUrl(raw: string): string | null {
  const url = raw.trim();
  return url.length > 0 ? url : null;
}
