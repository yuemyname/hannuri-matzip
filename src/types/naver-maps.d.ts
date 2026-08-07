// naver.maps 네임스페이스 자체는 @types/navermaps 가 전역으로 선언한다.
// 여기서는 SDK 가 인증 실패 시 호출하는 전역 훅만 덧붙인다 (SPEC §1.1).

declare global {
  interface Window {
    /**
     * NAVER Maps SDK 가 인증에 실패하면 직접 호출한다.
     * 스크립트 로드 자체는 200 이라 onError 로는 잡히지 않는다 — 이 훅이 유일한 신호다.
     */
    navermap_authFailure?: () => void;
  }
}

export {};
