"use client";

import { CategoryChip } from "@/components/category-chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORIES, type Category } from "@/lib/categories";
import { RADIUS_OPTIONS } from "@/features/map/config";
import { SORTS, type SortKey } from "./sort";

/**
 * 반경 토글 + 정렬 + 카테고리 칩 (SPEC §4.1).
 *
 * 반경 토글은 1.3 에서 지도 위에 띄웠던 것을 여기로 옮겼다 — SPEC 의 레이아웃이
 * 필터바 자리에 두고 있고, 지도 위에 겹쳐 두면 마커를 가린다.
 */
export function FilterBar({
  radius,
  radiusReady,
  onRadiusChange,
  sort,
  onSortChange,
  categories,
  onToggleCategory,
  onClearCategories,
}: {
  radius: number;
  /** 저장된 반경 복원 전에는 아무것도 눌린 걸로 보이지 않게 한다. 잘못된 값이
   *  잠깐 눌려 있다가 바뀌면 사용자가 자기가 안 누른 변화를 보게 된다 */
  radiusReady: boolean;
  onRadiusChange: (m: number) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  categories: readonly Category[];
  onToggleCategory: (c: Category) => void;
  onClearCategories: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="반경"
          className="flex gap-1 rounded-chip border border-border p-1"
        >
          {RADIUS_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={radiusReady && radius === m}
              onClick={() => onRadiusChange(m)}
              className={`tnum rounded-chip px-2.5 py-1 text-label ${
                radiusReady && radius === m
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {m}m
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* 지금 무엇으로 정렬 중인지 버튼에 그대로 쓴다 */}
            <Button variant="outline" size="sm">
              {SORTS[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <DropdownMenuItem key={key} onSelect={() => onSortChange(key)}>
                {/* 선택 표시. 색이 아니라 글자로 알린다 */}
                <span className="w-4 shrink-0" aria-hidden="true">
                  {sort === key ? "✓" : ""}
                </span>
                {SORTS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 칩은 가로 스크롤. 360px 에서 줄바꿈으로 필터바가 세로로 부풀지 않게 한다.
          -mx/px 로 스크롤 영역만 화면 끝까지 늘려 잘린 느낌을 없앤다. */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5">
        <button
          type="button"
          aria-pressed={categories.length === 0}
          onClick={onClearCategories}
          className={`inline-flex shrink-0 items-center rounded-chip px-3 py-1.5 text-label ${
            categories.length === 0
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-background text-foreground hover:bg-muted"
          }`}
        >
          전체
        </button>
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            category={c}
            selected={categories.includes(c)}
            onToggle={onToggleCategory}
          />
        ))}
      </div>
    </div>
  );
}
