"use client";

/**
 * 안내를 봤는지 여부 (WBS 6.4). 서버에 둘 값이 아니다 —
 * 익명 세션이라 사람이 아니라 브라우저에 붙는 정보고, 어차피 기기별로 한 번이다.
 *
 * `sessionStorage` 가 아니라 `localStorage` 를 쓴다. 탭을 닫을 때마다 다시 뜨면
 * 안내가 아니라 방해다.
 *
 * zustand 는 안 쓴다 — 지도 뷰 상태 전용이라고 못 박아 뒀다 (CLAUDE.md).
 */
const KEY = "hannuri-matzip.welcome";

// 안내 내용이 바뀌어서 다시 보여줘야 하면 이 값을 올린다.
const VERSION = "1";

export function hasSeenWelcome() {
  try {
    return localStorage.getItem(KEY) === VERSION;
  } catch {
    // 사파리 프라이빗 모드 등에서 접근 자체가 던진다. 그때는 "봤다"로 친다 —
    // 매번 뜨는 것보다 한 번도 안 뜨는 쪽이 덜 나쁘다.
    return true;
  }
}

export function markWelcomeSeen() {
  try {
    localStorage.setItem(KEY, VERSION);
  } catch {
    // 저장 못 해도 안내는 이미 떴다. 조용히 넘어간다.
  }
}
