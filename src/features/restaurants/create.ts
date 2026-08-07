"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import type { Category } from "@/lib/categories";

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
  menus: NewMenu[];
};

export class DuplicateRestaurantError extends Error {}

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
