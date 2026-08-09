"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import type { Category } from "@/lib/categories";
import type { Mood } from "@/lib/moods";

export type NewMenu = {
  name: string;
  price: number | null;
  isSignature: boolean;
};

export type NewRestaurant = {
  name: string;
  category: Category;
  address: string | null;
  roadAddress: string | null;
  lat: number;
  lng: number;
  priceRange: number | null;
  phone: string | null;
  memo: string | null;
  naverPlaceUrl: string | null;
  moodTags: Mood[];
  reservable: boolean;
  reservationUrl: string | null;
  menus: NewMenu[];
};

export class DuplicateRestaurantError extends Error {}

/**
 * 이미 같은 이름이 이 자리에 있는지 **저장 전에** 본다.
 *
 * 이걸 안 하면 이름·위치를 잡고 카테고리·가격·메모·메뉴까지 다 채운 다음에야
 * "이미 있어요" 를 만난다. 앞에서 막으면 헛수고가 없다.
 *
 * **규칙은 DB 인덱스(`restaurants_name_loc_uniq`)를 그대로 옮겼다** —
 * `lower(name)` + 위경도 소수 4자리(약 11m). 여기서 대충 "근처에 같은 이름" 으로
 * 잡으면, DB 는 받아 줄 등록을 화면이 막는 일이 생긴다.
 *
 * 그래도 **저장할 때의 검사를 없애지 않는다.** 둘이 동시에 같은 곳을 등록하면
 * 이 검사는 둘 다 통과시킨다. 진짜 보장은 인덱스 하나뿐이다.
 */
const CELL = 10_000; // 소수 4자리

export async function findDuplicate(
  name: string,
  coords: { lat: number; lng: number },
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  await ensureSession();

  // 인덱스는 반올림한 칸으로 묶는다. 칸 경계에 걸친 것도 후보로 받으려면
  // 한 칸 여유를 두고 훑은 뒤, 같은 규칙으로 다시 걸러야 한다.
  const pad = 1.5 / CELL;
  const { data, error } = await supabase.rpc("restaurants_in_bounds", {
    p_min_lat: coords.lat - pad,
    p_min_lng: coords.lng - pad,
    p_max_lat: coords.lat + pad,
    p_max_lng: coords.lng + pad,
    p_categories: null,
    p_limit: 50,
  });
  // 못 물어봤으면 막지 않는다. 저장할 때 인덱스가 다시 본다.
  if (error || !Array.isArray(data)) return null;

  // 좌표는 전부 양수(한국)라 JS 반올림과 Postgres round 가 같은 답을 준다.
  const cell = (n: number) => Math.round(n * CELL);
  const target = { name: name.toLowerCase(), lat: cell(coords.lat), lng: cell(coords.lng) };

  for (const row of data as unknown[]) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as { name?: unknown; lat?: unknown; lng?: unknown };
    if (typeof r.name !== "string") continue;
    if (r.name.toLowerCase() !== target.name) continue;
    if (cell(Number(r.lat)) !== target.lat) continue;
    if (cell(Number(r.lng)) !== target.lng) continue;
    return r.name;
  }
  return null;
}

/**
 * 맛집 등록 (SPEC §4.4-5).
 *
 * `created_by` 는 반드시 자기 자신이어야 한다 — RLS 의 insert 정책이 그렇게 걸려
 * 있고, 안 그러면 나중에 update/delete 의 소유자 검사가 무의미해진다.
 */
export async function createRestaurant(input: NewRestaurant): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase 설정이 없다");
  const session = await ensureSession();
  const userId = session?.user.id;
  if (!userId) throw new Error("세션이 없다");

  const { data, error } = await supabase
    .from("restaurants")
    .insert({
      name: input.name.trim(),
      category: input.category,
      address: input.address,
      road_address: input.roadAddress,
      // PostGIS 는 GeoJSON 을 받는다. 순서는 [lng, lat] — 뒤집으면 조용히 엉뚱한 곳에 박힌다.
      location: `SRID=4326;POINT(${input.lng} ${input.lat})`,
      price_range: input.priceRange,
      phone: input.phone,
      memo: input.memo,
      naver_place_url: input.naverPlaceUrl,
      mood_tags: input.moodTags,
      reservable: input.reservable,
      reservation_url: input.reservationUrl,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    // restaurants_name_loc_uniq — 같은 이름·좌표가 이미 있다 (§2.1)
    if (error.code === "23505") {
      throw new DuplicateRestaurantError(
        "같은 이름의 맛집이 이 위치에 이미 있어요",
      );
    }
    throw error;
  }

  const id = (data as { id: string }).id;

  const menus = input.menus.filter((m) => m.name.trim().length > 0);
  if (menus.length > 0) {
    // 메뉴가 실패해도 맛집은 이미 만들어졌다. 여기서 던지면 사용자는 "실패" 로
    // 읽고 다시 등록하려다 중복 에러를 만난다. 조용히 넘기고 상세로 보낸다 —
    // 메뉴는 상세에서 다시 추가할 수 있다 (5.3).
    const { error: menuError } = await supabase.from("menus").insert(
      menus.map((m) => ({
        restaurant_id: id,
        name: m.name.trim(),
        price: m.price,
        is_signature: m.isSignature,
      })),
    );
    if (menuError) console.error("메뉴 저장 실패", menuError);
  }

  return id;
}
