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
  lat: Number(process.env.NEXT_PUBLIC_FALLBACK_LAT ?? 37.537247),
  lng: Number(process.env.NEXT_PUBLIC_FALLBACK_LNG ?? 127.082473),
};

export const DEFAULT_ZOOM = 16;

/**
 * 한 번에 받아 오는 맛집 수.
 *
 * **이건 "그리는 개수" 가 아니다.** 화면에 뜨는 핀은 격자 클러스터링이 30개로
 * 묶어 준다 (cluster.ts). 여기 값은 "묶을 재료를 얼마나 받을까" 라서 넉넉해도 된다 —
 * 받은 건 하나도 안 버리고 전부 어느 원엔가 들어간다.
 *
 * 그래도 무한은 아니다. 이걸 넘기면 진짜로 잘리는 것이고, 그때는 화면이 말한다.
 */
export const FETCH_LIMIT = 300;

/**
 * 이보다 넓게 보면 아예 조회하지 않는다.
 *
 * 서울 전체가 들어오는 줌에서는 어차피 상한에 걸려 잘리고, 그렇게 잘린 100개는
 * 쓸모가 없다. 쿼터와 배터리만 쓴다. 13 은 대략 몇 km 폭 — 기본 줌(16)에서
 * 세 단계 밖이라 평소에는 걸리지 않는다.
 */
export const MIN_QUERY_ZOOM = 13;

/** 숫자 원을 눌렀을 때 몇 단계 확대할지. 한 단계면 잘 안 갈라지고, 셋이면 너무 튄다 */
export const ZOOM_INTO_STEP = 2;

/** 네이버 지도의 최대 줌. 더 넣어도 안 들어가므로 여기서 멈춘다 */
export const MAX_ZOOM = 21;

/**
 * 지도를 못 띄웠을 때 대신 쓸 조회 범위(도 단위 반쪽). 0.004도 ≈ 440m 로,
 * 기본 줌에서 화면에 들어오는 넓이와 비슷하다.
 *
 * 조회 범위가 지도에서만 온다면 SDK 가 안 뜨는 순간(키 없음·인증 실패·네트워크
 * 차단) 앱이 통째로 빈다 — 지도도 없고 목록도 없다. 그건 너무 크게 지는 것이다.
 */
export const FALLBACK_BOUNDS_SPAN_DEG = 0.004;

/**
 * 반경 토글 — **점메추 전용이다.** 지도는 "보이는 영역" 이 곧 조회 범위라
 * 반경을 안 쓴다. 점메추는 화면과 무관하게 "내 위치에서 N m" 로 후보를 고른다.
 * 100m 넘게 걸어가서 먹는 일이 없다는 판단으로 200m 가 상한.
 */
export const RADIUS_OPTIONS = [30, 50, 100, 200] as const;
/** 점메추가 처음 여는 반경. 넓은 쪽에서 시작해 좁히는 게 낫다 */
export const DEFAULT_RADIUS = 200;

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
