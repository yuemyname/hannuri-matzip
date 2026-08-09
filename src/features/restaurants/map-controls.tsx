"use client";

import Link from "next/link";
import { CategoryChip } from "@/components/category-chip";
import { CATEGORIES, type Category } from "@/lib/categories";
import { RADIUS_OPTIONS } from "@/features/map/config";

/**
 * 지도 **위에 떠 있는** 컨트롤 — 반경 토글 + 카테고리 토글(복수 선택) (SPEC §4.1).
 *
 * 아래에 붙은 바가 아니라 플로팅이다. 바로 두면 그만큼 지도가 잘리는데,
 * 컨트롤은 화면의 아래 몇 십 픽셀만 쓰면 되고 그 뒤의 지도는 계속 보이는 게 낫다.
 *
 * 떠 있으므로 **배경과 그림자가 필수다.** 지도 타일 위에 투명한 글자를 얹으면
 * 지도 색에 따라 읽히다 말다 한다. 지도 위 배너(`MapPanel`)와 같은 옷을 입힌다 —
 * `bg-background` + `border` + `shadow-pop`.
 *
 * 포인터 이벤트는 **컨트롤 자신만** 받는다. 감싸는 층이 이벤트를 먹으면
 * 지도 아래쪽을 손가락으로 끌 수 없게 된다.
 *
 * 리스트가 없으므로 조회 상태를 알리는 것도 여기 몫이다. 아무 말도 없으면
 * "마커가 없다"와 "못 불러왔다"를 구분할 방법이 없다.
 */
export function MapControls({
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
    <div className="flex flex-col gap-2">
      <Status
        count={count}
        isLoading={isLoading}
        isError={isError}
        hasFilters={categories.length > 0}
        onRetry={onRetry}
      />

      <div
        role="group"
        aria-label="반경"
        className="pointer-events-auto flex gap-1 self-start rounded-chip border border-border bg-background p-1 shadow-pop"
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

      {/* 칩은 가로 스크롤. 360px 에서 줄바꿈으로 부풀면 지도를 그만큼 덮는다.
          -mx/px 로 스크롤 영역만 화면 끝까지 늘려 잘린 느낌을 없앤다.
          이 줄은 스크롤을 받아야 해서 포인터 이벤트를 켠다. */}
      <div className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
        <button
          type="button"
          aria-pressed={categories.length === 0}
          onClick={onClearCategories}
          className={`inline-flex shrink-0 items-center rounded-chip px-3 py-1.5 text-label shadow-pop ${
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
            className="shadow-pop"
          />
        ))}
      </div>
    </div>
  );
}

/** 리스트가 맡던 로딩·에러·빈 결과 안내. 지도 위에 뜨므로 알약 하나로 줄인다 */
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
  const pill =
    "pointer-events-auto flex items-center gap-2 self-start rounded-chip border border-border bg-background px-3 py-1 text-caption shadow-pop";

  if (isError) {
    return (
      <p role="alert" className={pill}>
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
      <p role="status" className={`${pill} text-muted-foreground`}>
        불러오는 중
      </p>
    );
  }

  if (count === 0) {
    return (
      <p role="status" className={pill}>
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
    <p role="status" className={`${pill} tnum text-muted-foreground`}>
      {count}곳
    </p>
  );
}
