"use client";

import { create } from "zustand";

/**
 * 등록 화면의 핀 조정 단계 신호 (SHELL.md §4 / WBS 5.2).
 *
 * 등록 모달과 배경 지도는 **다른 라우트 트리**에 있다 (`@modal` 슬롯 vs `children`).
 * 서로 props 를 못 넘기므로 이 작은 스토어가 둘 사이의 손잡이가 된다.
 *
 * `map-store` 에 넣지 않은 이유: 그쪽은 `center/zoom/radius/selectedId` 만 담기로
 * 정해져 있다 (CLAUDE.md). 등록 플로우에서만 쓰는 값이라 따로 둔다.
 *
 * 좌표 자체는 여기 없다. 지도가 이미 `map-store.center` 에 중심을 쓰고 있어서
 * 폼은 그걸 읽으면 된다 — 같은 값을 두 군데 두면 반드시 갈라진다.
 */
type PinState = {
  /** true 면 배경 지도에 중앙 고정 핀이 뜨고 모달이 하단으로 내려간다 */
  active: boolean;
  setActive: (active: boolean) => void;
};

export const usePinMode = create<PinState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
