"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import { isCategory, type Category } from "@/lib/categories";

export type MyReview = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  rating: number;
  comment: string | null;
  visitedOn: string | null;
};

export type MyRestaurant = {
  id: string;
  name: string;
  category: Category;
  createdAt: string;
};

export type MyPick = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  mealType: "lunch" | "dinner";
  /** null = 뽑아만 놓고 안 고름, true = 여기로 갔다, false = 다시 뽑았다 */
  accepted: boolean | null;
  createdAt: string;
};

export type MyPage = {
  displayName: string;
  reviews: MyReview[];
  restaurants: MyRestaurant[];
  picks: MyPick[];
};

const rec = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** PostGREST 임베드는 관계에 따라 객체나 배열로 온다. 둘 다 받는다 */
function embedded(v: unknown): Record<string, unknown> | null {
  return Array.isArray(v) ? rec(v[0]) : rec(v);
}

export async function fetchMyPage(): Promise<MyPage | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const session = await ensureSession();
  const userId = session?.user.id;
  if (!userId) return null;

  // 세 섹션을 한꺼번에 띄운다. 순차로 하면 로딩이 세 번 쪼개져 보인다.
  const [profile, reviews, restaurants, picks] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("reviews")
      .select(
        "id, rating, comment, visited_on, restaurant_id, restaurants ( name )",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("restaurants")
      .select("id, name, category, created_at")
      .eq("created_by", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("recommendation_logs")
      .select(
        "id, meal_type, accepted, created_at, restaurant_id, restaurants ( name )",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    displayName: str(rec(profile.data)?.display_name) ?? "이름 없음",

    reviews: (reviews.data ?? [])
      .map((row): MyReview | null => {
        const r = rec(row);
        if (!r || typeof r.id !== "string") return null;
        return {
          id: r.id,
          restaurantId: str(r.restaurant_id) ?? "",
          // 맛집이 지워졌으면 임베드가 비어 온다. 리뷰 줄은 그래도 보여준다.
          restaurantName: str(embedded(r.restaurants)?.name) ?? "지워진 맛집",
          rating: Number(r.rating),
          comment: str(r.comment),
          visitedOn: str(r.visited_on),
        };
      })
      .filter((v): v is MyReview => v !== null),

    restaurants: (restaurants.data ?? [])
      .map((row): MyRestaurant | null => {
        const r = rec(row);
        const category = str(r?.category);
        if (!r || typeof r.id !== "string") return null;
        if (category === null || !isCategory(category)) return null;
        return {
          id: r.id,
          name: str(r.name) ?? "",
          category,
          createdAt: str(r.created_at) ?? "",
        };
      })
      .filter((v): v is MyRestaurant => v !== null),

    picks: (picks.data ?? [])
      .map((row): MyPick | null => {
        const r = rec(row);
        if (!r || typeof r.id !== "string") return null;
        const meal = str(r.meal_type);
        return {
          id: r.id,
          restaurantId: str(r.restaurant_id) ?? "",
          restaurantName: str(embedded(r.restaurants)?.name) ?? "지워진 맛집",
          mealType: meal === "dinner" ? "dinner" : "lunch",
          accepted: typeof r.accepted === "boolean" ? r.accepted : null,
          createdAt: str(r.created_at) ?? "",
        };
      })
      .filter((v): v is MyPick => v !== null),
  };
}

export const NAME_MAX = 20;

/** 닉네임 변경 (SPEC §4.5). `profiles_update` 정책이 본인 행만 허용한다 */
export async function renameMe(displayName: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase 설정이 없다");
  const session = await ensureSession();
  const userId = session?.user.id;
  if (!userId) throw new Error("세션이 없다");

  const name = displayName.trim();
  if (name.length === 0) throw new Error("이름이 비었다");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name.slice(0, NAME_MAX) })
    .eq("id", userId);
  if (error) throw error;
}
