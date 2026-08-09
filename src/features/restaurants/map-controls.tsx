"use client";

import { useState } from "react";
import Link from "next/link";
import { CategoryChip } from "@/components/category-chip";
import type { Category } from "@/lib/categories";

/**
 * 지도 **위에 떠 있는** 컨트롤 — 카테고리 토글(복수 선택) (SPEC §4.1).
 *
 * 반경 토글은 없앴다. 조회 범위가 "화면에 보이는 영역" 이 되면서 역할이 겹쳤다 —
 * 줄을 당기면 반경이 무시되고, 반경을 누르면 줄이 바뀐다. 보이는 데까지가 규칙이다.
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
  categories,
  onToggleCategory,
  onClearCategories,
  categoryCounts,
  allCategories,
  count,
  isLoading,
  isError,
  onRetry,
}: {
  categories: readonly Category[];
  onToggleCategory: (c: Category) => void;
  onClearCategories: () => void;
  /** 지금 화면 안에 실제로 있는 카테고리와 그 개수. 없는 종류는 칩을 안 그린다 */
  categoryCounts: ReadonlyMap<Category, number>;
  /** DB 가 정한 순서의 전체 목록. 칩을 세우는 순서를 여기서 가져온다 */
  allCategories: readonly Category[];
  count: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  // 칩 일곱 개를 늘 펼쳐 두면 지도 아래가 한 줄 통째로 막힌다.
  // 평소엔 [전체] [상세] 둘만 두고, 필요할 때만 편다.
  const [open, setOpen] = useState(false);

  // **지금 화면 안에 있는 종류만** 보여준다. 없는 걸 눌러 봐야 0건이다.
  // 고른 종류는 개수가 0이 돼도 남긴다 — 안 그러면 지도를 옮겼을 때
  // 칩이 사라져서 필터를 풀 방법이 없어진다.
  const shown = allCategories.filter(
    (c) => (categoryCounts.get(c) ?? 0) > 0 || categories.includes(c),
  );

  // 접혀 있어도 무엇이 걸렸는지는 보여야 한다. 안 그러면 결과가 왜 적은지 모른다.
  const summary =
    categories.length === 0
      ? "상세"
      : categories.length === 1
        ? categories[0]
        : `${categories[0]} 외 ${categories.length - 1}`;

  return (
    <div className="flex flex-col gap-2">
      <Status
        count={count}
        isLoading={isLoading}
        isError={isError}
        hasFilters={categories.length > 0}
        onRetry={onRetry}
      />

      {/* 칩은 가로 스크롤. 360px 에서 줄바꿈으로 부풀면 지도를 그만큼 덮는다.
          -mx/px 로 스크롤 영역만 화면 끝까지 늘려 잘린 느낌을 없앤다.
          이 줄은 스크롤을 받아야 해서 포인터 이벤트를 켠다.

          가운데 정렬은 안쪽 `w-max mx-auto` 로 한다. 스크롤 컨테이너에
          `justify-center` 를 걸면 **넘칠 때 왼쪽이 잘려 나가고 스크롤로도 못 닿는다.**
          w-max 는 다 들어가면 가운데, 넘치면 왼쪽부터 정상 스크롤이다. */}
      {/* **스크롤 상자 자체는 포인터를 안 받는다.** 이 줄은 화면 폭을 다 쓰므로,
          받게 두면 칩이 없는 좌우 빈 자리에서도 지도를 못 끈다 — 지도 아래쪽
          한 줄이 통째로 죽는다. 칩만 켜 두면 칩을 잡고 끄는 가로 스크롤은 그대로다. */}
      <div className="pointer-events-none -mx-3 overflow-x-auto px-3 pb-1">
        <div className="pointer-events-auto mx-auto flex w-max gap-2">
          <button
            type="button"
            aria-pressed={categories.length === 0}
            onClick={onClearCategories}
            className={chip(categories.length === 0)}
          >
            전체
          </button>

          {open ? (
            <>
              {shown.map((c) => (
                <CategoryChip
                  key={c}
                  category={c}
                  selected={categories.includes(c)}
                  onToggle={onToggleCategory}
                  count={categoryCounts.get(c) ?? 0}
                  className="shadow-pop"
                />
              ))}
              <button
                type="button"
                aria-expanded={true}
                onClick={() => setOpen(false)}
                className={chip(false)}
              >
                접기
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setOpen(true)}
              className={chip(categories.length > 0)}
            >
              {summary}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 칩 공통 옷. CategoryChip 은 카테고리 색을 쓰지만 이쪽은 중립이다 */
function chip(active: boolean) {
  return `inline-flex shrink-0 items-center gap-1 rounded-chip px-3 py-1.5 text-label shadow-pop ${
    active
      ? "bg-primary text-primary-foreground"
      : "border border-border bg-background text-foreground hover:bg-muted"
  }`;
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
    "pointer-events-auto flex items-center gap-2 self-center rounded-chip border border-border bg-background px-3 py-1 text-caption shadow-pop";

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
            : "이 근처에는 아직 등록된 곳이 없어요"}
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

  // 결과가 있으면 아무 말도 안 한다. "N곳" 알약은 지도를 가리는 값에 비해
  // 알려주는 게 적어서 뺐다 (2026-08-09 요청). 마커가 곧 답이다.
  // 로딩·에러·빈 결과만 남긴다 — 그건 마커가 없는 이유를 알려주는 유일한 창구다.
  return null;
}
