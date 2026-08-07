"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import { isCategory, type Category } from "@/lib/categories";
import type { NearbyRestaurant } from "@/features/restaurants/api";

export type MealType = "lunch" | "dinner";

export type PickParams = {
  lat: number;
  lng: number;
  radiusM: number;
  mealType: MealType;
  categories?: readonly Category[];
  maxPrice?: number | null;
  /** 최근 며칠 안에 간 곳을 뺄지. 0이면 제외하지 않는다 */
  excludeDays: number;
  /** 세션 안에서 이미 뽑힌 것들. [다시 뽑기] 가 같은 곳을 주지 않게 한다 */
  excludeIds?: readonly string[];
};

export type PickResult = {
  restaurant: NearbyRestaurant | null;
  /** 추천 로그 id. [여기로]/[다시] 를 누르면 이 행을 업데이트한다 (SPEC §2.3) */
  logId: string | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : null);

function toRestaurant(row: unknown): NearbyRestaurant | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const category = str(r.category);
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  if (category === null || !isCategory(category)) return null;
  return {
    id: r.id,
    name: r.name,
    category,
    roadAddress: str(r.road_address),
    lat: num(r.lat),
    lng: num(r.lng),
    priceRange: Number.isFinite(num(r.price_range)) ? num(r.price_range) : null,
    memo: str(r.memo),
    distanceM: Number.isFinite(num(r.distance_m)) ? num(r.distance_m) : 0,
    avgRating: Number.isFinite(num(r.avg_rating)) ? num(r.avg_rating) : 0,
    reviewCount: Number.isFinite(num(r.review_count)) ? num(r.review_count) : 0,
  };
}

/**
 * 한 곳 뽑기. **뽑는 건 서버다** (SPEC §3.2) — 여기서 random 을 쓰지 않는다.
 * 클라이언트 셔플은 응답을 받은 뒤의 연출일 뿐이다.
 *
 * 뽑자마자 `accepted = null` 로 로그를 남긴다. 뽑아만 놓고 안 간 경우도
 * 기록으로 남아야 §4.2 의 [여기로]/[다시] 통계가 의미를 가진다.
 */
export async function pickRestaurant(p: PickParams): Promise<PickResult> {
  const supabase = getSupabase();
  if (!supabase) return { restaurant: null, logId: null };
  const session = await ensureSession();
  const userId = session?.user.id ?? null;

  const { data, error } = await supabase.rpc("pick_restaurant", {
    p_lat: p.lat,
    p_lng: p.lng,
    p_radius_m: Math.round(p.radiusM),
    p_meal_type: p.mealType,
    p_categories: p.categories?.length ? [...p.categories] : null,
    p_max_price: p.maxPrice ?? null,
    p_exclude_days: p.excludeDays,
    p_exclude_ids: p.excludeIds?.length ? [...p.excludeIds] : null,
  });
  if (error) throw error;

  const rows: unknown = data;
  const first = Array.isArray(rows) ? rows[0] : null;
  const restaurant = toRestaurant(first);
  if (!restaurant || !userId) return { restaurant, logId: null };

  const { data: log } = await supabase
    .from("recommendation_logs")
    .insert({
      user_id: userId,
      restaurant_id: restaurant.id,
      meal_type: p.mealType,
      accepted: null,
    })
    .select("id")
    .single();

  return { restaurant, logId: (log as { id: string } | null)?.id ?? null };
}

/** [여기로 갈게요] = true, [다시 뽑기] = false (WBS 4.4) */
export async function answerPick(logId: string, accepted: boolean) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("recommendation_logs")
    .update({ accepted })
    .eq("id", logId);
}

/** 11시~15시는 점심, 그 밖은 저녁 (SPEC §4.2 "시간대 기반 기본값") */
export function defaultMealType(now: Date): MealType {
  const h = now.getHours();
  return h >= 11 && h < 15 ? "lunch" : "dinner";
}
