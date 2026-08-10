"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import type { LatLng } from "@/features/map/map-store";

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
 * 지금 보고 있는 근처에 **이미 등록된** 곳들의 열쇠.
 *
 * 후보 하나하나에 중복 질의를 날리면 15번을 왕복한다. 한 번에 받아서 화면에서
 * 거른다 — 어차피 사내 규모라 이 사각형 안이 수십 건을 넘지 않는다.
 *
 * 못 물어봤으면 **빈 집합**이다. 그러면 이미 등록된 곳이 후보에 섞여 보이는데,
 * 눌러도 DB 인덱스가 막아 주고 화면이 "이미 있어요" 를 말한다. 목록을 통째로
 * 못 보여주는 것보다 낫다.
 */
export async function fetchRegisteredKeys(
  center: LatLng,
): Promise<Set<string>> {
  const supabase = getSupabase();
  if (!supabase) return new Set();
  await ensureSession();

  const { data, error } = await supabase.rpc("restaurants_in_bounds", {
    p_min_lat: center.lat - BOX_DEG,
    p_min_lng: center.lng - BOX_DEG,
    p_max_lat: center.lat + BOX_DEG,
    p_max_lng: center.lng + BOX_DEG,
    p_categories: null,
    p_limit: 500,
  });
  if (error || !Array.isArray(data)) return new Set();

  const keys = new Set<string>();
  for (const row of data as unknown[]) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as { name?: unknown; lat?: unknown; lng?: unknown };
    if (typeof r.name !== "string") continue;
    keys.add(placeKey(r.name, Number(r.lat), Number(r.lng)));
  }
  return keys;
}
