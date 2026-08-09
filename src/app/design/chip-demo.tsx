"use client";

import { useState } from "react";
import { CategoryChip } from "@/components/category-chip";
import type { Category } from "@/lib/categories";

// 갤러리는 DB 를 안 부른다. 색 배정을 눈으로 보는 게 목적이라 씨앗 7종을 적어 둔다.
const CATEGORIES = ["한식","중식","일식","양식","분식","카페","기타"] as const;

export function ChipDemo() {
  const [picked, setPicked] = useState<Category[]>(["한식"]);

  const toggle = (c: Category) =>
    setPicked((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            category={c}
            selected={picked.includes(c)}
            onToggle={toggle}
          />
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        선택: {picked.length ? picked.join(", ") : "없음"}
      </p>
    </div>
  );
}
