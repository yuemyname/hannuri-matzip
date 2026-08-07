"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import { isCategory, type Category } from "@/lib/categories";

export type Menu = {
  id: string;
  name: string;
  price: number | null;
  isSignature: boolean;
};

export type Review = {
  id: string;
  userId: string;
  displayName: string;
  rating: number;
  comment: string | null;
  visitedOn: string | null;
  createdAt: string;
  photoPaths: string[];
};

export type RestaurantDetail = {
  id: string;
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
  menus: Menu[];
  reviews: Review[];
  avgRating: number;
  reviewCount: number;
  /** 5→1 점 순 개수. 분포 막대에 쓴다 */
  distribution: [number, number, number, number, number];
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : null);
const rec = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;

function toMenu(row: unknown): Menu | null {
  const m = rec(row);
  if (!m || typeof m.id !== "string" || typeof m.name !== "string") return null;
  return {
    id: m.id,
    name: m.name,
    price: Number.isFinite(num(m.price)) ? num(m.price) : null,
    isSignature: m.is_signature === true,
  };
}

function toReview(row: unknown): Review | null {
  const r = rec(row);
  if (!r || typeof r.id !== "string" || typeof r.user_id !== "string") {
    return null;
  }
  // PostgREST 임베드는 관계에 따라 객체 또는 배열로 온다. 둘 다 받는다.
  const p = Array.isArray(r.profiles) ? rec(r.profiles[0]) : rec(r.profiles);
  const photos = Array.isArray(r.review_photos) ? r.review_photos : [];

  return {
    id: r.id,
    userId: r.user_id,
    displayName: str(p?.display_name) ?? "익명",
    rating: num(r.rating),
    comment: str(r.comment),
    visitedOn: str(r.visited_on),
    createdAt: str(r.created_at) ?? "",
    photoPaths: photos
      .map((x) => str(rec(x)?.storage_path))
      .filter((x): x is string => x !== null),
  };
}

export async function fetchDetail(
  id: string,
): Promise<RestaurantDetail | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  await ensureSession();

  // 한 번에 가져온다. 세 번 왕복하면 로딩이 세 단계로 쪼개져 보인다.
  const { data, error } = await supabase
    .from("restaurants")
    .select(
      `id, name, category, address, road_address, price_range, phone, memo,
       naver_place_url, location,
       menus ( id, name, price, is_signature ),
       reviews ( id, user_id, rating, comment, visited_on, created_at,
                 profiles ( display_name ),
                 review_photos ( storage_path, ordinal ) )`,
    )
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  const r = rec(data);
  if (!r) return null;

  const category = str(r.category);
  if (category === null || !isCategory(category)) return null;

  // location 은 geography 라 PostgREST 가 GeoJSON 으로 준다.
  const geo = rec(r.location);
  const coords = Array.isArray(geo?.coordinates) ? geo.coordinates : [];
  const lng = num(coords[0]);
  const lat = num(coords[1]);

  const menus = (Array.isArray(r.menus) ? r.menus : [])
    .map(toMenu)
    .filter((m): m is Menu => m !== null)
    // 대표메뉴를 위로, 그다음 이름순. DB 는 순서를 보장하지 않는다.
    .sort(
      (a, b) =>
        Number(b.isSignature) - Number(a.isSignature) ||
        a.name.localeCompare(b.name, "ko"),
    );

  const reviews = (Array.isArray(r.reviews) ? r.reviews : [])
    .map(toReview)
    .filter((v): v is Review => v !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const distribution: [number, number, number, number, number] = [
    0, 0, 0, 0, 0,
  ];
  for (const v of reviews) {
    const i = 5 - Math.round(v.rating); // 5점이 0번 칸
    if (i >= 0 && i < 5) distribution[i] += 1;
  }
  const sum = reviews.reduce((acc, v) => acc + v.rating, 0);

  return {
    id: r.id as string,
    name: r.name as string,
    category,
    address: str(r.address),
    roadAddress: str(r.road_address),
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    priceRange: Number.isFinite(num(r.price_range)) ? num(r.price_range) : null,
    phone: str(r.phone),
    memo: str(r.memo),
    naverPlaceUrl: str(r.naver_place_url),
    menus,
    reviews,
    // 뷰(restaurant_stats)와 같은 규칙으로 반올림한다. 값이 갈리면 리스트와 상세가 달라 보인다.
    avgRating: reviews.length
      ? Math.round((sum / reviews.length) * 10) / 10
      : 0,
    reviewCount: reviews.length,
    distribution,
  };
}

/** 현재 익명 세션의 user_id. 내 리뷰를 가려내는 데 쓴다 */
export async function currentUserId(): Promise<string | null> {
  const session = await ensureSession();
  return session?.user.id ?? null;
}
