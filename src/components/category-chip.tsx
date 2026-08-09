"use client";

import { categoryColorClass, type Category } from "@/lib/categories";
import { cn } from "./ui/cn";

// 색은 이름에서 나온다 (categoryColorClass). 목록이 DB 로 옮겨가 열려 버려서
// 여기에 이름별 표를 둘 수 없다 — 새 종류가 생기는 즉시 색이 없어진다.

export function CategoryChip({
  category,
  selected = false,
  onToggle,
  /** 지도 위에 띄울 때 그림자를 얹는 용도. 모달 안에서는 안 쓴다 */
  className,
  /**
   * 이 카테고리에 지금 몇 곳이 있는지. 숫자를 붙여 두면 "눌렀는데 0건" 이 사라진다.
   * 등록 폼처럼 개수 개념이 없는 곳에서는 안 넘긴다.
   */
  count,
}: {
  category: Category;
  selected?: boolean;
  onToggle?: (category: Category) => void;
  className?: string;
  count?: number;
}) {
  return (
    // button 이라 Tab 도달과 Enter/Space 토글이 그냥 된다 (CLAUDE.md 접근성).
    // 포커스 링은 전역 :focus-visible 이 처리한다.
    <button
      type="button"
      aria-pressed={selected}
      // 개수는 눈으로만 보고 라벨은 깔끔하게 둔다 — 스크린리더가 "한식 3" 을
      // 읽으면 3이 무슨 뜻인지 알 수 없다.
      aria-label={count === undefined ? undefined : `${category} ${count}곳`}
      onClick={() => onToggle?.(category)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-chip px-3 py-1.5 text-label transition-colors",
        selected
          ? categoryColorClass(category)
          : "border border-border bg-background text-foreground hover:bg-muted",
        className,
      )}
    >
      {/* 선택 상태를 색으로만 알리지 않는다. 흑백으로 봐도 구분된다 */}
      {selected && <span aria-hidden="true">✓</span>}
      {category}
      {count !== undefined && (
        <span className="tnum opacity-80">{count}</span>
      )}
    </button>
  );
}
