"use client";

import { useState } from "react";
import { CategoryChip } from "@/components/category-chip";
import { CATEGORIES, type Category } from "@/lib/categories";

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
