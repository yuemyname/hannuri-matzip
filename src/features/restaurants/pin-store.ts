"use client";

import { create } from "zustand";
import type { LatLng } from "@/features/map/map-store";

/**
 * 등록 화면의 핀 조정 단계 신호 (SHELL.md §4 / WBS 5.2).
 *
 * 등록 모달과 배경 지도는 **다른 라우트 트리**에 있다 (`@modal` 슬롯 vs `children`).
 * 서로 props 를 못 넘기므로 이 작은 스토어가 둘 사이의 손잡이가 된다.
 *
 * `map-store` 에 넣지 않은 이유: 그쪽은 `center/zoom/radius/selectedId` 만 담기로
 * 정해져 있다 (CLAUDE.md). 등록 플로우에서만 쓰는 값이라 따로 둔다.
 *
 * **확정된 좌표는 여기 없다.** 지도가 이미 `map-store.center` 에 중심을 쓰고 있어서
 * 폼은 그걸 읽으면 된다 — 같은 값을 두 군데 두면 반드시 갈라진다.
 * `target` 은 그것과 반대 방향이다. 상태의 사본이 아니라 **"지도를 여기로 옮겨라"**
 * 라는 한 번짜리 지시고, 지도가 옮기고 나면 스스로 비운다.
 */
type PinState = {
  /** true 면 배경 지도에 중앙 고정 핀이 뜨고 모달이 하단으로 내려간다 */
  active: boolean;
  /**
   * 핀 단계에 들어갈 때 지도를 옮길 곳 — 지역검색이 준 가게 좌표.
   *
   * 이게 없으면 핀이 "내가 보던 자리" 에 찍힌다. 그러면 미세조정이 아니라
   * 사용자가 가게를 지도에서 처음부터 찾아가야 한다 (SPEC §4.4-3 은 미세조정이다).
   * 직접 입력이라 좌표를 모르면 null — 그때는 보던 자리에서 시작하는 게 맞다.
   */
  target: LatLng | null;
  start: (target: LatLng | null) => void;
  stop: () => void;
  /** 지도가 다 옮긴 뒤 호출한다. 안 비우면 사용자가 끌어 놓은 걸 도로 되돌린다 */
  clearTarget: () => void;
};

export const usePinMode = create<PinState>((set) => ({
  active: false,
  target: null,
  start: (target) => set({ active: true, target }),
  stop: () => set({ active: false, target: null }),
  clearTarget: () => set({ target: null }),
}));
