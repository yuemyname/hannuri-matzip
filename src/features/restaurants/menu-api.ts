"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import type { Menu } from "./detail-api";

/** 편집 중인 한 줄. `id` 가 없으면 새로 추가된 것이다 */
export type MenuDraft = {
  id: string | null;
  name: string;
  price: number | null;
  isSignature: boolean;
};

export const toDraft = (m: Menu): MenuDraft => ({
  id: m.id,
  name: m.name,
  price: m.price,
  isSignature: m.isSignature,
});

/**
 * 메뉴 저장 — 지우고 다시 넣지 않고 **바뀐 것만** 손댄다 (WBS 5.3).
 *
 * 전부 지웠다 넣으면 id 가 매번 바뀐다. 지금은 눈에 안 띄지만 나중에 메뉴에
 * 사진이나 좋아요가 붙으면 그게 통째로 끊긴다.
 *
 * `menus` 는 등록자로 묶여 있지 않다 (SPEC §2.3) — 누구나 고칠 수 있는 공유 정보다.
 * 그렇게 안 하면 메뉴가 거의 안 채워진다는 판단이고, 훼손 위험은 §8 에 적혀 있다.
 */
export async function saveMenus(
  restaurantId: string,
  drafts: MenuDraft[],
  original: Menu[],
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase 설정이 없다");
  await ensureSession();

  // 이름이 빈 줄은 저장하지 않는다. 추가 버튼만 누르고 안 채운 경우다.
  const kept = drafts.filter((d) => d.name.trim().length > 0);

  const keptIds = new Set(kept.map((d) => d.id).filter(Boolean));
  const removed = original.filter((m) => !keptIds.has(m.id)).map((m) => m.id);
  if (removed.length > 0) {
    const { error } = await supabase.from("menus").delete().in("id", removed);
    if (error) throw error;
  }

  const byId = new Map(original.map((m) => [m.id, m]));
  const changed = kept.filter((d) => {
    if (!d.id) return false;
    const before = byId.get(d.id);
    if (!before) return false;
    return (
      before.name !== d.name.trim() ||
      before.price !== d.price ||
      before.isSignature !== d.isSignature
    );
  });
  for (const d of changed) {
    const { error } = await supabase
      .from("menus")
      .update({
        name: d.name.trim(),
        price: d.price,
        is_signature: d.isSignature,
      })
      .eq("id", d.id!);
    if (error) throw error;
  }

  const added = kept.filter((d) => !d.id);
  if (added.length > 0) {
    const { error } = await supabase.from("menus").insert(
      added.map((d) => ({
        restaurant_id: restaurantId,
        name: d.name.trim(),
        price: d.price,
        is_signature: d.isSignature,
      })),
    );
    if (error) throw error;
  }
}

/**
 * 대표메뉴 한 줄. 점메추 결과 카드가 쓴다 (SPEC §4.2, WBS 5.3 DoD).
 * 없으면 null — 결과 카드는 메뉴 없이도 멀쩡해야 한다.
 */
export async function fetchSignatureMenu(
  restaurantId: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("menus")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("is_signature", true)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  const name = (data as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : null;
}
