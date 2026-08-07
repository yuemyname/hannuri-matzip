import { cn } from "./cn";

/**
 * 로딩 자리표시자 (WBS 6.1).
 * `animate-pulse` 는 전역 prefers-reduced-motion 규칙이 사실상 멈춰준다.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
