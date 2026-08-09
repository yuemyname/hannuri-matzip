"use client";

import type { Category } from "@/lib/categories";
import { cn } from "./ui/cn";

// 카테고리별 색. Tailwind 는 클래스 문자열을 정적으로 읽으므로 조립하지 말고 전부 적는다.
// Record<Category, …> 라서 카테고리를 추가하면 여기서 타입 에러가 난다 —
// src/lib/categories.ts 와 갈라지지 않게 하는 장치다.
const SELECTED: Record<Category, string> = {
  한식: "bg-cat-korean text-white",
  중식: "bg-cat-chinese text-white",
  일식: "bg-cat-japanese text-white",
  양식: "bg-cat-western text-white",
  분식: "bg-cat-snack text-white",
  카페: "bg-cat-cafe text-white",
  기타: "bg-cat-etc text-white",
};

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
          ? SELECTED[category]
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
