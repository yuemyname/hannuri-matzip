"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "./cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          // 떠 있는 것이라 그림자를 쓴다. 나머지는 border 1px 이 기본 (CLAUDE.md)
          "z-[var(--z-modal)] min-w-[10rem] rounded-lg border border-border bg-popover p-1 shadow-pop",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-body outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Separator>) {
  return (
    <Menu.Separator
      className={cn("my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
