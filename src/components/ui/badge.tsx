import { cn } from "./cn";

const VARIANT = {
  neutral: "border-border bg-secondary text-secondary-foreground",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
  danger: "border-border bg-background text-destructive",
} as const;

export function Badge({
  variant = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: keyof typeof VARIANT }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-caption",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
