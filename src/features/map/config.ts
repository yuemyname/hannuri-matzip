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

/** 반경 토글 (SPEC §4.1). 100m 넘게 걸어가서 먹는 일이 없다는 판단으로 200m 가 상한 */
export const RADIUS_OPTIONS = [30, 50, 100, 200] as const;
export const DEFAULT_RADIUS = 50;

/**
 * fitBounds 여백(px). 없으면 반경 원이 화면 끝에 딱 붙어서 원으로 안 보이고
 * 그냥 확대된 지도처럼 읽힌다. 위아래는 배너·반경 토글에 가리지 않을 만큼 더 준다.
 * 지도 API 에 넘기는 값이라 CSS 토큰이 아니다.
 */
export const FIT_BOUNDS_MARGIN = {
  top: 56,
  bottom: 56,
  left: 24,
  right: 24,
};

/**
 * 지도 SDK 는 CSS 를 모른다. 색·투명도를 JS 값으로 넘겨야 해서 토큰을 읽어온다.
 * 코드에 hex 를 박지 않기 위한 우회로다 (CLAUDE.md 스타일 규칙).
 *
 * 못 읽으면 undefined 를 준다. 호출부는 그 옵션을 아예 넘기지 않고 SDK 기본값에 맡긴다 —
 * 여기에 hex 기본값을 적어두면 토큰 정본이 두 군데가 되고 검증 스캔에도 걸린다.
 */
export function readToken(name: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || undefined;
}

/** 투명도처럼 숫자로 넘겨야 하는 토큰. 숫자 기본값은 hex 가 아니라 그대로 둔다. */
export function readTokenNumber(name: string, fallback: number): number {
  const n = Number(readToken(name));
  return Number.isFinite(n) ? n : fallback;
}
