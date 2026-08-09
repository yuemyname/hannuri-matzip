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
  /**
   * `dock` 은 등록 화면의 핀 조정 단계 전용이다 (SHELL.md §4).
   * 모달을 하단으로 내리고 배경 지도를 만질 수 있게 연다 — 모달 안에 두 번째
   * 지도를 만들지 않기 위한 장치다.
   */
  variant = "full",
}: {
  title: string;
  children: React.ReactNode;
  variant?: "full" | "dock";
}) {
  const docked = variant === "dock";
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

  // **핀 조정 단계에서 배경 지도를 만질 수 있게 body 잠금을 푼다 (SHELL.md §4).**
  //
  // Radix 의 modal 다이얼로그는 `body { pointer-events: none }` 을 걸어 모달 바깥을
  // 통째로 막는다. 그래서 "지도를 움직여 핀에 맞추세요" 라고 적어 놓고 정작 지도가
  // 손가락에 반응하지 않았다. 오버레이를 투명하게 해도 소용없다 —
  // 막는 건 오버레이가 아니라 body 다.
  //
  // `Dialog.Root` 의 `modal` 을 끄는 게 정공법처럼 보이지만 쓸 수 없다. Radix 는
  // modal / non-modal 에서 **다른 컴포넌트**(DialogContentModal / NonModal)를 쓰기
  // 때문에, 값이 바뀌면 Content 가 리마운트되고 그 안의 등록 폼이 1단계로 초기화된다.
  //
  // Radix 는 레이어가 붙고 떨어질 때만 이 값을 쓴다. 그 사이에 우리가 덮어써도
  // 다시 건드리지 않으므로, 핀 단계 동안만 풀었다가 되돌려 놓는다.
  useEffect(() => {
    if (!docked) return;
    const body = document.body;
    const locked = body.style.pointerEvents; // Radix 가 넣어 둔 "none"
    body.style.pointerEvents = "auto";
    return () => {
      body.style.pointerEvents = locked;
    };
  }, [docked]);

  const close = () => router.back();

  // 아래로 드래그해서 닫기 (SHELL.md §2 모바일 닫기 경로).
  // 핸들이 lg 이상에서 숨겨지므로 데스크톱에서는 이 경로가 아예 없다.
  const onPointerDown = (e: React.PointerEvent) => {
    // 핀 조정 중에는 아래로 끌어 닫는 경로를 막는다. 지도를 움직이다가
    // 손가락이 모달에 닿으면 폼이 통째로 사라진다.
    if (docked) return;
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
        {/* 배경. 지도는 뒤에 그대로 살아있지만 이 오버레이가 인터랙션을 막는다.
            핀 조정 중에는 지도를 만져야 하므로 투명 + 클릭 통과로 바꾼다 (SHELL.md §4).

            **언마운트하지 않는다.** Radix Portal 은 자식을 마운트 순서대로 붙이는데,
            오버레이를 껐다 켜면 Content 뒤에 다시 붙어서 모달 위를 덮는다.
            그러면 폼이 통째로 안 눌린다. 존재는 유지하고 스타일만 바꾼다. */}
        <Dialog.Overlay
          // **인라인 style 이어야 한다.** Radix 는 오버레이에 `pointerEvents: "auto"` 를
          // 인라인으로 박는다. `pointer-events-none` 클래스로는 못 이겨서, 투명한
          // 오버레이가 지도 위 클릭을 전부 삼키고 있었다 — 핀 단계에서 지도가
          // 안 움직이던 두 원인 중 하나다 (다른 하나는 body 잠금).
          // Radix 가 자기 style 을 먼저 깔고 우리 style 을 뒤에 펼치므로 이게 이긴다.
          style={docked ? { pointerEvents: "none" } : undefined}
          className={`fixed inset-0 z-[var(--z-modal)] ${
            docked ? "bg-transparent" : "bg-ink-900/40"
          }`}
        />

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
          // 핀 조정 중에는 모달 밖(=지도) 조작을 막지 않는다.
          onInteractOutside={docked ? (e) => e.preventDefault() : undefined}
          onPointerDownOutside={docked ? (e) => e.preventDefault() : undefined}
          style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
          className={`
            fixed inset-x-0 bottom-0 z-[var(--z-modal)]
            flex flex-col
            rounded-t-xl border border-border bg-background
            pb-[env(safe-area-inset-bottom)]
            ${
              docked
                ? // 하단 220px. 지도를 최대한 열어 준다 (SHELL.md §4).
                  "max-h-[13.75rem] shadow-sheet lg:inset-x-auto lg:right-4 lg:bottom-4 lg:w-full lg:max-w-[560px] lg:rounded-xl"
                : "max-h-[92dvh] lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:max-h-[85dvh] lg:w-full lg:max-w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-lg"
            }
          `}
        >
          {/* 드래그 핸들 — 모바일 전용 */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`flex shrink-0 justify-center py-2 lg:hidden ${
              docked ? "" : "cursor-grab touch-none"
            }`}
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
