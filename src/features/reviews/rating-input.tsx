"use client";

import { useRef } from "react";

/**
 * 별점 입력. `radiogroup` 이라 좌우 화살표로 옮기고 Space 로 고른다 —
 * 마우스 없이도 쓸 수 있어야 한다 (WBS 3.2, CLAUDE.md 접근성).
 *
 * 숫자를 옆에 함께 적는다. 별 색만으로 값을 알리지 않는다.
 */
const VALUES = [1, 2, 3, 4, 5] as const;

export function RatingInput({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id?: string;
}) {
  // 화살표로 값을 바꾸면 **포커스도 따라가야 한다.** 값만 바꾸면 스크린리더가
  // 계속 원래 별을 읽어서, 지금 몇 점인지 소리로는 알 수 없다.
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (next: number) => {
    onChange(next);
    refs.current[next - 1]?.focus();
  };

  return (
    <div className="flex items-center gap-2">
      <div
        id={id}
        role="radiogroup"
        aria-label="별점"
        className="flex items-center gap-0.5"
      >
        {VALUES.map((v) => (
          <button
            key={v}
            ref={(el) => {
              refs.current[v - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${v}점`}
            // 고른 것만 탭 정지점이 된다. 나머지는 화살표로 옮긴다 (radiogroup 규약)
            tabIndex={value === v || (value === 0 && v === 1) ? 0 : -1}
            onClick={() => onChange(v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                move(Math.min(5, (value || 0) + 1));
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                move(Math.max(1, (value || 1) - 1));
              }
            }}
            className={`rounded-sm p-1 ${v <= value ? "text-star" : "text-star-empty"}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-7">
              <path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" />
            </svg>
          </button>
        ))}
      </div>
      <span className="tnum text-label text-muted-foreground">
        {value ? `${value}점` : "별점을 골라 주세요"}
      </span>
    </div>
  );
}
