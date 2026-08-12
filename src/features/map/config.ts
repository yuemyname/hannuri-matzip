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

/**
 * 사무실 — 위치를 못 얻었을 때의 기준점 (SPEC §1.2, §5).
 *
 * 위치 공유를 안 해도 앱이 **여기 기준으로** 움직인다. 지도가 여기서 열리고,
 * 목록이 여기서 가까운 순으로 서고, 카드에 적히는 거리도 여기서 잰 값이다.
 *
 * 좌표는 **실측값이다** (2026-08-11, 사용자 제공). 잠깐 내자동 일대의 대략값을
 * 쓴 적이 있는데, 지번을 좌표로 바꿔 줄 지오코딩을 이 환경에서 못 부르기
 * 때문이었다 (네이버·OSM 둘 다 막혀 있다). 지금 값은 건물 좌표라 점메추 30m
 * 같은 좁은 반경에서도 맞는다.
 *
 * **환경변수로 안 받는다** (2026-08-11). 예전에는 `NEXT_PUBLIC_FALLBACK_LAT/LNG`
 * 가 이걸 덮었는데, 배포에 옛 좌표(구의동)가 남아 있으면 코드를 아무리 고쳐도
 * 배포본은 안 바뀐다 — 실제로 그 상태였다. 사무실은 하나뿐이고 바뀔 일이 거의
 * 없으니, 정본을 여기 한 곳에 둔다.
 */
export const OFFICE = {
  name: "한누리빌딩",
  address: "서울 종로구 내자동 219",
  lat: 37.575044596083465,
  lng: 126.97286523872602,
};

/** GPS 를 못 쓸 때 기준이 되는 좌표 (SPEC §5). 사무실과 같은 값이다 */
export const FALLBACK_CENTER = { lat: OFFICE.lat, lng: OFFICE.lng };

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
 *
 * 상한을 200m → **1km** 로 올렸다 (2026-08-12 요청). "100m 넘게 걸어가서 먹는
 * 일이 없다" 로 200m 를 잡았는데, 그건 맛집이 촘촘히 등록된 뒤의 이야기였다.
 * 지금은 200m 안에 몇 곳뿐이라 뽑을 게 없다는 말만 나오고, 종류도 한둘로
 * 쏠린다. 도보 12분쯤인 1km 까지 열어 둔다 — 넓히는 건 사용자가 고른다.
 */
export const RADIUS_OPTIONS = [30, 50, 100, 200, 500, 1000] as const;

/**
 * 반경을 글자로. 1000m 는 「1km」로 적는다 — 네 자리 미터는 읽는 데 한 박자
 * 걸린다. `Distance` 와 같은 규칙이지만 그쪽은 소수 한 자리까지 쓴다
 * (340m·1.2km). 여기 값은 토글이라 딱 떨어지는 것만 들어온다.
 */
export function radiusLabel(m: number): string {
  return m < 1000 ? `${m}m` : `${m / 1000}km`;
}
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
