"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { cn } from "./cn";
import { Button } from "./button";

/**
 * 파괴적 동작 확인용. **모달 위에 띄울 수 있는 유일한 예외다** (SHELL.md §3).
 * 리뷰 삭제(WBS 3.2)처럼 되돌릴 수 없는 것에만 쓴다.
 *
 * 기본 Dialog 와 달리 배경 클릭·Esc 로 닫히지 않는다 — Radix 의 AlertDialog 규약이고,
 * 실수로 지워지는 걸 막는 게 목적이다.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "취소",
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  /** 실제로 일어나는 일을 쓴다. "확인" ✗ → "리뷰 삭제" ✓ (CLAUDE.md) */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-ink-900/40" />
        <AlertDialog.Content
          className={cn(
            // 뷰포트 폭 단위 대신 % 를 쓴다. 스크롤바가 있으면 100vw 가 넘친다.
            "fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[22rem] max-w-[calc(100%-2rem)]",
            "-translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-4 shadow-pop",
          )}
        >
          <AlertDialog.Title className="text-subtitle">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" size="sm">
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
