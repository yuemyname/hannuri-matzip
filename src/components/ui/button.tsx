import { cn } from "./cn";

// 색·radius 는 전부 토큰 경유 (CLAUDE.md). 포커스 링은 전역 :focus-visible 이 처리하므로
// 여기서 ring 을 따로 붙이지 않는다.
const VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-brand-700",
  secondary: "bg-secondary text-secondary-foreground hover:bg-ink-200",
  outline: "border border-border bg-background hover:bg-muted",
  ghost: "hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:bg-brand-900",
} as const;

const SIZE = {
  sm: "h-8 gap-1 px-3 text-label",
  md: "h-10 gap-1.5 px-4",
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;

/**
 * 버튼처럼 보여야 하는데 버튼이 아닌 것에 쓴다 — 주로 `Link`.
 * 이동은 `a` 여야 새 탭·주소 복사가 되므로, `button` 에 onClick 으로 라우팅하지 않는다.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      // 폼 안에서 실수로 submit 되지 않게 기본값을 둔다. 필요하면 호출부가 덮는다.
      type="button"
      className={buttonClass({ variant, size, className })}
      {...props}
    />
  );
}
