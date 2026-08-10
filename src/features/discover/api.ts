"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import type { LatLng } from "@/features/map/map-store";
import { metersBetween } from "@/features/map/geo";
import { isCategory } from "@/lib/categories";
import type { NearbyRestaurant } from "@/features/restaurants/api";

/**
 * 이미 등록된 곳을 가려내기 위한 열쇠 모음.
 *
 * **규칙은 `create.ts` 의 중복 검사와 같아야 한다** — `lower(name)` + 위경도
 * 소수 4자리(약 11m). DB 인덱스(`restaurants_name_loc_uniq`)가 그 규칙이라,
 * 여기서 느슨하게 잡으면 등록 버튼을 눌렀을 때 인덱스가 거절한다. 반대로
 * 빡빡하게 잡으면 이미 있는 집이 후보에 또 뜬다.
 */
const CELL = 10_000;

export function placeKey(name: string, lat: number, lng: number): string {
  const cell = (n: number) => Math.round(n * CELL);
  return `${name.toLowerCase()}|${cell(lat)}|${cell(lng)}`;
}

/** 후보를 거를 만큼 넓게 본다. 반경이 아니라 사각형이라 대충 이 정도면 덮는다 */
const BOX_DEG = 0.02; // 약 2km

/**
 * 지금 보고 있는 근처에 **이미 등록된** 곳들. 가까운 순.
 *
 * 두 가지에 쓴다.
 *   1. 네이버 후보에서 이미 있는 곳을 걸러낸다 (`placeKey`)
 *   2. 목록 맨 위에 몇 개 얹는다 — "내 지도엔 이만큼 있다" 는 맥락이다
 *
 * 후보 하나하나에 중복 질의를 날리면 15번을 왕복한다. 한 번에 받아서 화면에서
 * 거른다 — 어차피 사내 규모라 이 사각형 안이 수십 건을 넘지 않는다.
 *
 * 못 물어봤으면 **빈 배열**이다. 그러면 이미 등록된 곳이 후보에 섞여 보이는데,
 * 눌러도 DB 인덱스가 막아 주고 화면이 "이미 등록돼 있어요" 를 말한다. 목록을
 * 통째로 못 보여주는 것보다 낫다.
 */
export async function fetchRegisteredNearby(
  center: LatLng,
): Promise<NearbyRestaurant[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureSession();

  const { data, error } = await supabase.rpc("restaurants_in_bounds", {
    p_min_lat: center.lat - BOX_DEG,
    p_min_lng: center.lng - BOX_DEG,
    p_max_lat: center.lat + BOX_DEG,
    p_max_lng: center.lng + BOX_DEG,
    p_categories: null,
    p_limit: 500,
  });
  if (error || !Array.isArray(data)) return [];

  const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
  const rows: NearbyRestaurant[] = [];
  for (const row of data as unknown[]) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const category = r.category;
    if (typeof r.id !== "string" || typeof r.name !== "string") continue;
    if (!isCategory(category)) continue;
    const lat = num(r.lat);
    const lng = num(r.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push({
      id: r.id,
      name: r.name,
      category,
      roadAddress: typeof r.road_address === "string" ? r.road_address : null,
      lat,
      lng,
      priceRange: Number.isFinite(num(r.price_range)) ? num(r.price_range) : null,
      memo: typeof r.memo === "string" ? r.memo : null,
      // 서버가 준 distance_m 은 조회 기준점 것이라 여기서 다시 잰다.
      distanceM: Math.round(metersBetween(center, { lat, lng })),
      avgRating: Number.isFinite(num(r.avg_rating)) ? num(r.avg_rating) : 0,
      reviewCount: Number.isFinite(num(r.review_count)) ? num(r.review_count) : 0,
      moodTags: [],
      reservable: r.reservable === true,
    });
  }
  return rows.sort((a, b) => a.distanceM - b.distanceM);
}
