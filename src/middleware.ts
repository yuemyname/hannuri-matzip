import { NextResponse, type NextRequest } from "next/server";

/**
 * 주소창으로 들어온 하위 화면은 전부 메인으로 보낸다.
 *
 * 이 앱은 메인 셸 하나 위에서 돌아간다 (SHELL.md). 하위 화면은 지도 위에 뜨는
 * 모달이고, 풀페이지는 직접 진입용 fallback 일 뿐이라 지도 없이 덩그러니 뜬다.
 * 새로고침할 때마다 그 어색한 화면을 보게 되는 게 싫다는 요청이라, 문서 요청은
 * 메인으로 돌린다.
 *
 * **그래서 슬랙에 공유한 맛집 링크는 상세로 열리지 않고 메인만 뜬다.**
 * SHELL.md §0 이 지키려던 것과 정면으로 부딪히는 동작이고, 알고 고른 결과다.
 * 되돌릴 때는 이 파일만 지우면 된다 — 다른 곳에 흔적을 남기지 않았다.
 *
 * **클라이언트 이동은 건드리면 안 된다.** 모달을 여는 것도 라우팅이라, 여기서
 * 같이 막으면 앱에서 아무 화면도 못 연다. 문서 요청만 골라내는 기준이
 * `Sec-Fetch-Dest: document` 다 — 주소창·새로고침·링크 클릭은 `document`,
 * Next 가 화면을 바꾸며 가져가는 RSC 페이로드는 `empty` 로 온다.
 *
 * 헤더가 없으면(아주 오래된 브라우저) 그냥 통과시킨다. 판단을 못 하는 쪽에서는
 * 원래 화면을 보여주는 게 낫다 — 반대로 걸면 모달이 통째로 안 열린다.
 */
export function middleware(req: NextRequest) {
  if (req.headers.get("sec-fetch-dest") !== "document") return;
  const res = NextResponse.redirect(new URL("/", req.url));
  // **캐시하지 못하게 한다.** 이 규칙은 코드가 바뀌면 같이 바뀐다 — 브라우저가
  // 예전 리다이렉트를 들고 있으면 새 화면(`/admin` 처럼 나중에 예외로 뺀 경로)이
  // 배포된 뒤에도 계속 메인으로 튕긴다. 그러면 원인이 서버에 없어서 못 찾는다.
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: [
    /*
     * 메인(`/`)과 아래는 손대지 않는다:
     *   api        — 화면이 아니다
     *   _next      — 빌드 산출물
     *   design     — 토큰 갤러리. 주소창으로 들어가는 게 유일한 진입로라 튕기면 못 쓴다
     *   admin      — 관리자 화면. 지도 셸 위의 모달이 아니라 별개 화면이라
     *                주소창으로 들어가는 게 유일한 길이다
     *   *.*        — favicon 같은 정적 파일
     */
    "/((?!api|_next|design|admin|.*\\.).+)",
  ],
};
