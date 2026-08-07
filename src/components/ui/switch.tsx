"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "./cn";

/**
 * 켜짐/꺼짐. Radix 가 role="switch" 와 키보드 조작을 처리한다.
 * 색만으로 상태를 알리지 않도록, 쓰는 쪽에서 항상 라벨을 함께 둔다 (CLAUDE.md).
 */
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-chip border border-transparent transition-colors",
        "bg-ink-300 data-[state=checked]:bg-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-5 rounded-chip bg-background shadow-marker transition-transform",
          "translate-x-0.5 data-[state=checked]:translate-x-[1.375rem]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
