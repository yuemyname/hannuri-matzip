"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import { isCategory, type Category } from "@/lib/categories";
import { toMoods } from "@/lib/moods";
import type { NearbyRestaurant } from "@/features/restaurants/api";
import { fetchSignatureMenu } from "@/features/restaurants/menu-api";

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
};

// **세션 안에서 이미 뽑힌 곳을 빼는 기능은 없앴다** (2026-08-10, 사용자 결정).
// 예전에는 `excludeIds` 를 모아 넘겨서 [다시 뽑기] 가 같은 곳을 안 주게 했는데,
// 사내 맛집은 한 동네에 몇 곳뿐이라 두세 번이면 후보가 바닥났다. 이제 매번
// 전체에서 새로 뽑는다 — 같은 곳이 또 나올 수 있고, 그건 정상이다.
//
// DB 함수의 `p_exclude_ids` 파라미터는 그대로 둔다. 마이그레이션은 덧붙이기만
// 하는 것이고, 기본값이 null 이라 안 넘기면 없는 것과 같다.

export type PickResult = {
  restaurant: NearbyRestaurant | null;
  /** 추천 로그 id. [여기로]/[다시] 를 누르면 이 행을 업데이트한다 (SPEC §2.3) */
  logId: string | null;
  /** 결과 카드에 쓸 대표메뉴 (SPEC §4.2). 없으면 null — 카드는 없어도 멀쩡해야 한다 */
  signatureMenu: string | null;
  /** 예약 링크. 없으면 null (전화만 받거나 예약을 안 받는 곳) */
  reservationUrl: string | null;
};

/**
 * 뽑힌 곳의 예약 정보.
 *
 * `pick_restaurant` 이 안 준다 — 그 함수는 `restaurants_within` 과 컬럼을 맞추고
 * 있어서, 예약 두 칸을 끼우려면 함수를 통째로 다시 만들어야 한다. 뽑은 뒤 한 곳만
 * 물어보면 되는 값이라 대표메뉴와 같이 한 번 더 다녀오는 쪽이 싸다.
 */
async function fetchReservation(
  restaurantId: string,
): Promise<{ reservable: boolean; reservationUrl: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { reservable: false, reservationUrl: null };
  const { data, error } = await supabase
    .from("restaurants")
    .select("reservable, reservation_url")
    .eq("id", restaurantId)
    .maybeSingle();
  // 못 물어봤으면 "예약 정보 없음" 으로 둔다. 이것 때문에 추천이 실패하면 안 된다.
  if (error || !data) return { reservable: false, reservationUrl: null };
  const r = data as Record<string, unknown>;
  return { reservable: r.reservable === true, reservationUrl: str(r.reservation_url) };
}

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
    moodTags: toMoods(r.mood_tags),
    reservable: r.reservable === true,
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
  if (!supabase)
    return {
      restaurant: null,
      logId: null,
      signatureMenu: null,
      reservationUrl: null,
    };
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
  });
  if (error) throw error;

  const rows: unknown = data;
  const first = Array.isArray(rows) ? rows[0] : null;
  const restaurant = toRestaurant(first);
  if (!restaurant)
    return {
      restaurant: null,
      logId: null,
      signatureMenu: null,
      reservationUrl: null,
    };

  // 대표메뉴는 RPC 가 안 준다 (restaurants_within 과 같은 컬럼이라서).
  // 로그 기록과 함께 병렬로 가져온다 — 어차피 셔플 1.2초 뒤에 화면에 뜬다.
  const [signatureMenu, reservation, log] = await Promise.all([
    fetchSignatureMenu(restaurant.id),
    fetchReservation(restaurant.id),
    userId
      ? supabase
          .from("recommendation_logs")
          .insert({
            user_id: userId,
            restaurant_id: restaurant.id,
            meal_type: p.mealType,
            accepted: null,
          })
          .select("id")
          .single()
          .then((r) => r.data as { id: string } | null)
      : Promise.resolve(null),
  ]);

  return {
    restaurant: { ...restaurant, reservable: reservation.reservable },
    logId: log?.id ?? null,
    signatureMenu,
    reservationUrl: reservation.reservationUrl,
  };
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
