"use client";

// 사진은 올리기 전에 브라우저에서 줄인다 (WBS 3.3).
// 폰 사진 원본은 3~8MB 다. 그대로 올리면 무료 스토리지가 금방 차고,
// 리스트에서 내려받는 쪽도 느려진다.

/** 장변 기준. 상세 헤더에 쓰는 크기라 이 이상은 의미가 없다 */
const MAX_EDGE = 1600;
/** 저장 예산 (WBS 3.3 DoD). 넘으면 품질을 낮추고, 그래도 넘으면 더 줄인다 */
const BUDGET_BYTES = 500_000;
/** 순서대로 시도한다. 앞이 실패할수록 뒤로 간다 */
const ATTEMPTS: { edge: number; quality: number }[] = [
  { edge: MAX_EDGE, quality: 0.8 },
  { edge: MAX_EDGE, quality: 0.65 },
  { edge: 1280, quality: 0.65 },
  { edge: 1280, quality: 0.5 },
  { edge: 1024, quality: 0.5 },
];
export const MAX_PHOTOS = 3;

export type Resized = { blob: Blob; width: number; height: number };

/**
 * 장변 1600px · WebP 로 줄인다. 결과가 500KB 를 넘으면 품질과 크기를 단계적으로
 * 낮춰 예산 안에 넣는다 — 노이즈가 많은 사진은 1600px/q0.8 로는 700KB 가 나온다.
 *
 * WebP 를 못 만드는 브라우저(오래된 Safari)면 JPEG 로 떨어진다 —
 * 업로드 자체가 실패하는 것보다 낫다.
 */
export async function resizeForUpload(file: File): Promise<Resized> {
  const bitmap = await createImageBitmap(file);
  try {
    let last: Resized | null = null;
    for (const attempt of ATTEMPTS) {
      const out = await encode(bitmap, attempt.edge, attempt.quality);
      last = out;
      if (out.blob.size <= BUDGET_BYTES) return out;
    }
    // 마지막 시도까지 넘으면 그거라도 올린다. 원본보다는 훨씬 작다.
    return last!;
  } finally {
    bitmap.close();
  }
}

async function encode(
  bitmap: ImageBitmap,
  edge: number,
  quality: number,
): Promise<Resized> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context 를 못 얻었다");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && webp.type === "image/webp") return { blob: webp, width, height };

  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("이미지를 변환하지 못했다");
  return { blob: jpeg, width, height };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}

/**
 * Storage 경로. **첫 조각이 반드시 uid 여야 한다** —
 * RLS 정책이 `(storage.foldername(name))[1] = auth.uid()` 로 소유자를 판별한다 (SPEC §2.3).
 */
export function photoPath(
  userId: string,
  reviewId: string,
  index: number,
  blob: Blob,
) {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return `${userId}/${reviewId}/${index}.${ext}`;
}
