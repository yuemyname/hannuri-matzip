"use client";

import Link from "next/link";
import { CategoryChip } from "@/components/category-chip";
import { CATEGORIES, type Category } from "@/lib/categories";
import { RADIUS_OPTIONS } from "@/features/map/config";

/**
 * 지도 아래 컨트롤 바 — 반경 토글 + 카테고리 토글(복수 선택) (SPEC §4.1).
 *
 * 리스트가 없어졌으므로 **조회 상태를 알리는 것도 여기 몫이다.** 예전에는
 * 로딩·에러·빈 결과를 리스트가 맡았는데, 그게 사라진 자리에 아무 말도 없으면
 * "마커가 없다"와 "못 불러왔다"를 구분할 방법이 없다.
 *
 * 정렬 드롭다운은 뺐다. 정렬은 리스트 순서를 정하는 것이었고, 지도 위 마커에는
 * 순서가 없다.
 */
export function FilterBar({
  radius,
  radiusReady,
  onRadiusChange,
  categories,
  onToggleCategory,
  onClearCategories,
  count,
  isLoading,
  isError,
  onRetry,
}: {
  radius: number;
  /** 저장된 반경 복원 전에는 아무것도 눌린 걸로 보이지 않게 한다. 잘못된 값이
   *  잠깐 눌려 있다가 바뀌면 사용자가 자기가 안 누른 변화를 보게 된다 */
  radiusReady: boolean;
  onRadiusChange: (m: number) => void;
  categories: readonly Category[];
  onToggleCategory: (c: Category) => void;
  onClearCategories: () => void;
  count: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
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

        <Status
          count={count}
          isLoading={isLoading}
          isError={isError}
          hasFilters={categories.length > 0}
          onRetry={onRetry}
        />
      </div>

      {/* 칩은 가로 스크롤. 360px 에서 줄바꿈으로 바가 세로로 부풀면 지도를 먹는다.
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

/** 리스트가 맡던 로딩·에러·빈 결과 안내. 한 줄로 줄여 바 안에 둔다 */
function Status({
  count,
  isLoading,
  isError,
  hasFilters,
  onRetry,
}: {
  count: number;
  isLoading: boolean;
  isError: boolean;
  hasFilters: boolean;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <p role="alert" className="flex items-center gap-2 text-caption">
        {/* 사과하지 않고 다음 행동을 알려준다 (CLAUDE.md) */}
        <span className="text-muted-foreground">맛집을 불러오지 못했어요</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-chip px-2 py-0.5 font-medium text-brand-700 hover:bg-accent"
        >
          다시 시도
        </button>
      </p>
    );
  }

  if (isLoading) {
    return (
      <p role="status" className="text-caption text-muted-foreground">
        불러오는 중
      </p>
    );
  }

  if (count === 0) {
    return (
      <p role="status" className="flex items-center gap-2 text-caption">
        <span className="text-muted-foreground">
          {hasFilters
            ? "고른 종류에는 없어요"
            : "이 반경에는 아직 등록된 곳이 없어요"}
        </span>
        {/* 빈 상태는 행동 유도 (CLAUDE.md). 종류를 좁혀서 빈 거면 등록이 답이 아니다 */}
        {!hasFilters && (
          <Link
            href="/restaurants/new"
            className="shrink-0 font-medium text-brand-700"
          >
            맛집 등록하기
          </Link>
        )}
      </p>
    );
  }

  // 마커 개수를 글자로도 적는다. 지도만 보면 겹친 마커를 셀 수 없다.
  return (
    <p role="status" className="tnum text-caption text-muted-foreground">
      {count}곳
    </p>
  );
}
