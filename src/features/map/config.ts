// SPEC §1.1 / §1.2
//
// NEXT_PUBLIC_* 는 빌드 시점에 문자열로 치환된다. 반드시 멤버 접근 형태로 그대로 써야
// 치환되므로 process.env[key] 같은 동적 접근을 쓰지 않는다.

/** Web Dynamic Map Client ID. 공개돼도 되지만 NCP 에서 서비스 URL 로 보호한다. */
export const NAVER_MAP_CLIENT_ID =
  process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? "";

/**
 * SDK URL. 파라미터는 `ncpKeyId` 다.
 * `ncpClientId` 는 구버전이며 지금 쓰면 인증 실패한다 (SPEC §1.1, CLAUDE.md).
 */
export function naverMapsSdkUrl(clientId: string) {
  return `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`;
}

/** GPS 를 못 쓸 때 기준이 되는 사무실 좌표 (SPEC §1.2, §5). 1.2 에서 실제 위치로 대체된다. */
export const FALLBACK_CENTER = {
  lat: Number(process.env.NEXT_PUBLIC_FALLBACK_LAT ?? 37.5665),
  lng: Number(process.env.NEXT_PUBLIC_FALLBACK_LNG ?? 126.978),
};

export const DEFAULT_ZOOM = 16;
