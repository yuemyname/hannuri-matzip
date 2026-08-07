"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";

/**
 * 인터셉트 라우트가 쓰는 모달 (SHELL.md §2, §3).
 *
 * - 모바일(<1024px): 하단 시트 92dvh / 데스크톱: 중앙 다이얼로그 max-w-560
 *   분기는 여기 안에서만 한다. 호출부는 모른다.
 * - 닫기는 항상 `router.back()`. `push('/')` 로 닫으면 히스토리가 쌓여 뒤로가기가 깨진다.
 * - focus trap / aria-modal / Esc / 포커스 복귀는 Radix 가 처리한다. 직접 구현 금지.
 * - body 스크롤 락도 Radix 담당. `overflow:hidden` 을 직접 붙이지 않는다.
 */
export function Modal({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  // 닫으면 트리거로 포커스를 되돌린다 (SHELL.md §3).
  // Radix 의 자동 복귀는 여기서 안 통한다 — 닫기가 곧 라우팅이라 Radix 가 복귀시키는
  // 시점과 화면 전환이 겹쳐 포커스가 body 로 떨어진다. 직접 기억했다가 되돌린다.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      if (!opener || !document.contains(opener)) return;
      // 라우팅이 끝난 다음 프레임에 옮긴다.
      requestAnimationFrame(() => opener.focus());
    };
  }, []);

  const close = () => router.back();

  // 아래로 드래그해서 닫기 (SHELL.md §2 모바일 닫기 경로).
  // 핸들이 lg 이상에서 숨겨지므로 데스크톱에서는 이 경로가 아예 없다.
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    const dragged = dragY;
    dragStart.current = null;
    setDragY(0);
    if (dragged > DRAG_CLOSE_PX) close();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        {/* 배경. 지도는 뒤에 그대로 살아있지만 이 오버레이가 인터랙션을 막는다 */}
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-ink-900/40" />

        <Dialog.Content
          ref={contentRef}
          // Radix 는 배경에 aria-hidden 을 거는 방식이라 aria-modal 은 안 붙인다.
          // SHELL.md §3 이 명시한 항목이라 직접 단다.
          aria-modal="true"
          onOpenAutoFocus={(e) => {
            // 첫 포커스는 제목으로 (SHELL.md §3). 닫을 때 복귀는 Radix 가 한다.
            e.preventDefault();
            contentRef.current
              ?.querySelector<HTMLElement>("[data-modal-title]")
              ?.focus();
          }}
          style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
          className="
            fixed inset-x-0 bottom-0 z-[var(--z-modal)]
            flex max-h-[92dvh] flex-col
            rounded-t-xl border border-border bg-background
            pb-[env(safe-area-inset-bottom)]
            lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2
            lg:max-h-[85dvh] lg:w-full lg:max-w-[560px]
            lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-lg
          "
        >
          {/* 드래그 핸들 — 모바일 전용 */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="flex shrink-0 cursor-grab touch-none justify-center py-2 lg:hidden"
          >
            <span className="h-1 w-10 rounded-chip bg-ink-300" />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 lg:pt-4">
            <Dialog.Title
              data-modal-title
              tabIndex={-1}
              className="text-title outline-none"
            >
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="닫기"
              className="rounded-chip px-2 py-1 text-label text-muted-foreground hover:bg-muted"
            >
              닫기
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** 이만큼 아래로 끌면 닫는다. 지도 API 여백처럼 CSS 가 아니라 제스처 임계값이다. */
const DRAG_CLOSE_PX = 80;
