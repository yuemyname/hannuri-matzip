"use client";

import { MAX_MARKERS } from "@/features/map/config";
import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import { isCategory, type Category } from "@/lib/categories";

/** `restaurants_within` 이 돌려주는 한 줄 (SPEC §3.1) */
export type NearbyRestaurant = {
  id: string;
  name: string;
  category: Category;
  roadAddress: string | null;
  lat: number;
  lng: number;
  priceRange: number | null;
  memo: string | null;
  distanceM: number;
  avgRating: number;
  reviewCount: number;
};

export type NearbyParams = {
  lat: number;
  lng: number;
  radiusM: number;
  categories?: readonly Category[];
  minRating?: number;
};

/**
 * RPC 응답은 타입이 없다. 줄 단위로 좁히고, 모양이 안 맞는 줄은 버린다.
 * 한 줄이 이상하다고 목록 전체를 날리면 화면이 통째로 빈다.
 */
function toRestaurant(row: unknown): NearbyRestaurant | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;

  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const str = (v: unknown) => (typeof v === "string" ? v : null);

  const lat = num(r.lat);
  const lng = num(r.lng);
  const category = str(r.category);

  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // 카테고리가 목록 밖이면 필터칩과 어긋난다. DB check 가 막지만 이중으로 본다.
  if (category === null || !isCategory(category)) return null;

  return {
    id: r.id,
    name: r.name,
    category,
    roadAddress: str(r.road_address),
    lat,
    lng,
    priceRange: Number.isFinite(num(r.price_range)) ? num(r.price_range) : null,
    memo: str(r.memo),
    distanceM: Number.isFinite(num(r.distance_m)) ? num(r.distance_m) : 0,
    // 리뷰가 없으면 뷰가 0 을 준다. 0 은 "별점 없음" 이지 "0점" 이 아니다.
    avgRating: Number.isFinite(num(r.avg_rating)) ? num(r.avg_rating) : 0,
    reviewCount: Number.isFinite(num(r.review_count)) ? num(r.review_count) : 0,
  };
}

/** 지도 뷰포트. 남서(min) ~ 북동(max) 두 모서리 */
export type Bounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

/**
 * 지금 보이는 영역의 맛집 (`restaurants_in_bounds`).
 *
 * 반경이 아니라 뷰포트가 기준이다 — 줄을 당겨 넓히면 더 보이고 좁히면 덜 보인다.
 * 거리는 안 받는다. 화면에 적히는 거리는 내 위치 기준으로 다시 재기 때문이다.
 */
export async function fetchInBounds(
  b: Bounds,
  categories?: readonly Category[],
): Promise<NearbyRestaurant[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureSession();

  const { data, error } = await supabase.rpc("restaurants_in_bounds", {
    p_min_lat: b.minLat,
    p_min_lng: b.minLng,
    p_max_lat: b.maxLat,
    p_max_lng: b.maxLng,
    p_categories: categories?.length ? [...categories] : null,
    // **하나 더 받는다.** 딱 상한만큼 받으면 "마침 100곳" 과 "잘렸다" 를
    // 구분할 수 없다. 한 건 더 오면 넘쳤다는 뜻이다.
    p_limit: MAX_MARKERS + 1,
  });
  if (error) throw error;

  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map(toRestaurant)
    .filter((r): r is NearbyRestaurant => r !== null);
}

export async function fetchNearby({
  lat,
  lng,
  radiusM,
  categories,
  minRating,
}: NearbyParams): Promise<NearbyRestaurant[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  // 세션이 없으면 RLS 가 전부 걸러서 0건이 온다 (§2.3). 조회 전에 확보한다.
  await ensureSession();

  const { data, error } = await supabase.rpc("restaurants_within", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: Math.round(radiusM),
    p_categories: categories?.length ? [...categories] : null,
    p_min_rating: minRating ?? null,
  });
  if (error) throw error;

  const rows: unknown = data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map(toRestaurant)
    .filter((r): r is NearbyRestaurant => r !== null);
}
