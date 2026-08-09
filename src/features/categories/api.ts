"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import { isCategory, type Category } from "@/lib/categories";

/** 목록 순서까지가 데이터다. `sort_order` 로 세우고, 같으면 이름순 */
export async function fetchCategories(): Promise<Category[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureSession();

  const { data, error } = await supabase
    .from("categories")
    .select("name")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  return (data ?? [])
    .map((row) => (row as { name: unknown }).name)
    .filter(isCategory);
}

export const CATEGORIES_KEY = ["categories"] as const;

/**
 * 종류 목록. 필터칩·등록 폼·점메추가 전부 여기서 받는다.
 *
 * 거의 안 변하는 데다 화면 여러 곳이 동시에 쓴다. `staleTime` 을 길게 줘서
 * 모달을 열 때마다 다시 물어보지 않게 한다 — 등록 폼에서 새 종류를 만들면
 * 그때 이 키를 무효화한다.
 */
export function useCategories() {
  return useQuery<Category[]>({
    queryKey: CATEGORIES_KEY,
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 없으면 만든다. 이미 있으면 아무 일도 안 한다.
 *
 * 등록 폼에서 직접 적은 종류가 여기를 지난다. **맛집을 넣기 전에** 불러야 한다 —
 * `restaurants.category` 가 이 표를 가리키는 외래키라, 순서가 뒤집히면 등록이
 * 통째로 실패한다.
 */
export async function ensureCategory(name: Category): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase 없음");
  await ensureSession();

  // 같은 이름을 둘이 동시에 만들 수 있다. 그건 충돌이 아니라 이미 있는 것이므로
  // ignoreDuplicates 로 조용히 넘어간다.
  const { error } = await supabase
    .from("categories")
    .upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
  if (error) throw error;
}
