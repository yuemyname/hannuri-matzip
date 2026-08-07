import { cn } from "./cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      // 글자 크기를 여기서 지정하지 않는다. globals.css 가 input 을 16px 로 고정하는데
      // 유틸리티 클래스를 얹으면 그게 이겨서 iOS 자동 확대가 되살아난다.
      className={cn(
        "h-11 w-full rounded-sm border border-input bg-background px-3",
        "placeholder:text-ink-400 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
