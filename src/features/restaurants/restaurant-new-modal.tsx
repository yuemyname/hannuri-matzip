"use client";

import { Modal } from "@/components/modal";
import { usePinMode } from "./pin-store";
import { RestaurantNewView } from "./restaurant-new-view";

/**
 * 등록 모달. 핀 조정 단계에서 모달을 하단으로 내려야 하는데(SHELL.md §4),
 * 그 단계는 뷰 안쪽 상태다. 스토어를 통해 여기까지 올려 받는다.
 */
export function RestaurantNewModal() {
  const pinning = usePinMode((s) => s.active);
  return (
    <Modal title="맛집 등록" variant={pinning ? "dock" : "full"}>
      <RestaurantNewView canPin />
    </Modal>
  );
}
