"use client";

import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/session";
import { MAX_PHOTOS, photoPath, resizeForUpload } from "./photo";

export const REVIEW_BUCKET = "review-photos";

export type ReviewInput = {
  restaurantId: string;
  rating: number;
  comment: string;
  visitedOn: string | null;
  /** 새로 고른 파일. 비우면 기존 사진을 그대로 둔다 */
  files?: File[];
};

/**
 * 리뷰 저장. **upsert 다** — `unique (restaurant_id, user_id)` 가 걸려 있어서
 * 같은 사람이 두 번 쓰면 새 리뷰가 아니라 기존 리뷰 수정이 된다 (WBS 3.2 DoD).
 */
export async function saveReview(
  input: ReviewInput,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase 설정이 없다");
  const session = await ensureSession();
  const userId = session?.user.id;
  if (!userId) throw new Error("세션이 없다");

  const { data, error } = await supabase
    .from("reviews")
    .upsert(
      {
        restaurant_id: input.restaurantId,
        user_id: userId,
        rating: input.rating,
        comment: input.comment.trim() || null,
        visited_on: input.visitedOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,user_id" },
    )
    .select("id")
    .single();

  if (error) throw error;
  const reviewId = (data as { id: string }).id;

  const files = (input.files ?? []).slice(0, MAX_PHOTOS);
  if (files.length > 0) {
    await replacePhotos(reviewId, userId, files, onProgress);
  }
  return reviewId;
}

async function replacePhotos(
  reviewId: string,
  userId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
) {
  const supabase = getSupabase();
  if (!supabase) return;

  // 예전 사진을 먼저 지운다. 새로 고른 걸 "교체" 로 다루기 때문이다.
  const { data: old } = await supabase
    .from("review_photos")
    .select("storage_path")
    .eq("review_id", reviewId);
  const oldPaths = (old ?? []).map(
    (r) => (r as { storage_path: string }).storage_path,
  );
  if (oldPaths.length) {
    await supabase.storage.from(REVIEW_BUCKET).remove(oldPaths);
    await supabase.from("review_photos").delete().eq("review_id", reviewId);
  }

  const rows: { review_id: string; storage_path: string; ordinal: number }[] =
    [];
  for (const [i, file] of files.entries()) {
    const { blob } = await resizeForUpload(file);
    const path = photoPath(userId, reviewId, i, blob);
    const { error } = await supabase.storage
      .from(REVIEW_BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: true });
    if (error) throw error;
    rows.push({ review_id: reviewId, storage_path: path, ordinal: i });
    onProgress?.(i + 1, files.length);
  }

  if (rows.length) {
    const { error } = await supabase.from("review_photos").insert(rows);
    if (error) throw error;
  }
}

export async function deleteReview(reviewId: string) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("supabase 설정이 없다");
  await ensureSession();

  // Storage 는 DB cascade 를 안 따라온다. 파일을 먼저 지운다.
  const { data: photos } = await supabase
    .from("review_photos")
    .select("storage_path")
    .eq("review_id", reviewId);
  const paths = (photos ?? []).map(
    (r) => (r as { storage_path: string }).storage_path,
  );
  if (paths.length) {
    await supabase.storage.from(REVIEW_BUCKET).remove(paths);
  }

  // review_photos 는 on delete cascade 라 따로 안 지운다.
  const { error } = await supabase.from("reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

/** 비공개 버킷이라 서명 URL 로만 내려간다 (SPEC §2.3) */
export async function signedPhotoUrls(paths: string[]): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(REVIEW_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error) return [];
  return (data ?? [])
    .map((d) => d.signedUrl)
    .filter((u): u is string => typeof u === "string");
}
