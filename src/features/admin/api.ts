"use client";

/**
 * 관리자 화면이 서버 라우트와 주고받는 얇은 층.
 *
 * **여기서 Supabase 를 직접 부르지 않는다.** 관리자는 남의 리뷰·맛집을 고쳐야 하는데
 * RLS 는 작성자 본인만 허용하고(SPEC §2.3) 카테고리는 정책이 아예 없다. 그래서
 * 쓰기는 전부 서버 라우트를 지나고, service_role 키는 서버에만 있다.
 */

export type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  visited_on: string | null;
  created_at: string;
  user_id: string;
  restaurant_id: string;
  restaurants: { name: string } | null;
};

export type AdminRestaurant = {
  id: string;
  name: string;
  category: string;
  road_address: string | null;
  price_range: number | null;
  memo: string | null;
};

export type AdminCategory = {
  name: string;
  sort_order: number;
  /** 이 종류를 쓰는 맛집 수. 0 이 아니면 못 지운다 */
  usedBy: number;
};

/** 서버가 준 문구를 그대로 띄운다. 여기서 다시 지어내면 이유가 흐려진다 */
export class AdminError extends Error {}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    // 쿠키가 붙어야 관문을 지난다. same-origin 이라 기본값으로도 붙지만 명시한다.
    credentials: "same-origin",
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const message =
      typeof payload === "object" && payload !== null
        ? ((payload as { error?: unknown }).error ?? null)
        : null;
    throw new AdminError(
      typeof message === "string" ? message : "요청이 실패했어요",
    );
  }
  return payload as T;
}

export const adminStatus = () => call<{ ok: boolean }>("login");
export const adminLogin = (password: string) =>
  call<{ ok: true }>("login", { method: "POST", body: { password } });
export const adminLogout = () => call<{ ok: true }>("login", { method: "DELETE" });

export const listReviews = () =>
  call<{ reviews: AdminReview[] }>("reviews").then((r) => r.reviews);
export const patchReview = (body: {
  id: string;
  rating?: number;
  comment?: string | null;
}) => call<{ ok: true }>("reviews", { method: "PATCH", body });
export const deleteReview = (id: string) =>
  call<{ ok: true }>("reviews", { method: "DELETE", body: { id } });

export const listRestaurants = () =>
  call<{ restaurants: AdminRestaurant[] }>("restaurants").then(
    (r) => r.restaurants,
  );
export const patchRestaurant = (body: {
  id: string;
  name?: string;
  category?: string;
  priceRange?: number | null;
  memo?: string | null;
}) => call<{ ok: true }>("restaurants", { method: "PATCH", body });
export const deleteRestaurant = (id: string) =>
  call<{ ok: true }>("restaurants", { method: "DELETE", body: { id } });

export const listCategories = () =>
  call<{ categories: AdminCategory[] }>("categories").then((r) => r.categories);
export const addCategory = (name: string) =>
  call<{ ok: true }>("categories", { method: "POST", body: { name } });
export const renameCategory = (name: string, to: string) =>
  call<{ ok: true }>("categories", { method: "PATCH", body: { name, to } });
export const removeCategory = (name: string) =>
  call<{ ok: true }>("categories", { method: "DELETE", body: { name } });
