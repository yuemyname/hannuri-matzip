"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { detailKey } from "@/features/restaurants/use-detail";
import type { Review } from "@/features/restaurants/detail-api";
import { RatingInput } from "./rating-input";
import { deleteReview, saveReview } from "./api";
import { MAX_PHOTOS } from "./photo";

/**
 * 리뷰 작성/수정. **상세 모달 안에서 뷰만 바뀐다** — 모달 위에 모달을 띄우지 않는다
 * (SHELL.md §3). 삭제 확인만 AlertDialog 로, 그건 유일한 예외다.
 */
export function ReviewForm({
  restaurantId,
  existing,
  onDone,
  onCancel,
}: {
  restaurantId: string;
  /** 있으면 수정. unique 제약 때문에 새로 쓰기가 곧 수정이다 */
  existing: Review | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [visitedOn, setVisitedOn] = useState(existing?.visitedOn ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  // 3.4 — 저장하면 상세와 목록을 함께 무효화한다. 그래야 뒤에 깔린 리스트와
  // 마커의 평균 별점이 바로 따라온다.
  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: detailKey(restaurantId) }),
      qc.invalidateQueries({ queryKey: ["restaurants", "nearby"] }),
    ]);
  };

  const save = useMutation({
    mutationFn: () =>
      saveReview(
        { restaurantId, rating, comment, visitedOn: visitedOn || null, files },
        (done, total) => setProgress({ done, total }),
      ),
    onSuccess: async () => {
      await invalidate();
      setProgress(null);
      onDone();
    },
    onError: () => setProgress(null),
  });

  const remove = useMutation({
    mutationFn: () => deleteReview(existing!.id),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  const busy = save.isPending || remove.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (rating > 0 && !busy) save.mutate();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-medium">별점</span>
        <RatingInput value={rating} onChange={setRating} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium">한 줄 남기기</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="뭐가 좋았는지, 언제 가면 좋은지"
          // text-* 클래스를 두지 않는다. globals 의 16px 이 살아야 iOS 가 확대하지 않는다.
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 placeholder:text-ink-400"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium">방문일</span>
        <Input
          type="date"
          value={visitedOn}
          onChange={(e) => setVisitedOn(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium">
          사진{" "}
          <span className="text-muted-foreground">최대 {MAX_PHOTOS}장</span>
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) =>
            setFiles(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))
          }
          className="text-label file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-label"
        />
        {files.length > 0 && (
          <span className="text-caption text-muted-foreground">
            {files.length}장 선택됨 · 올리면서 자동으로 줄입니다
          </span>
        )}
        {existing && files.length === 0 && existing.photoPaths.length > 0 && (
          <span className="text-caption text-muted-foreground">
            새로 고르지 않으면 기존 사진 {existing.photoPaths.length}장이 그대로
            남아요
          </span>
        )}
      </label>

      {progress && (
        <p role="status" className="tnum text-caption text-muted-foreground">
          사진 올리는 중 {progress.done}/{progress.total}
        </p>
      )}

      {(save.isError || remove.isError) && (
        // 사과하지 않고 다음 행동을 알려준다 (CLAUDE.md)
        <p role="alert" className="text-caption text-danger">
          저장하지 못했어요. 잠시 후 다시 눌러 주세요.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={rating === 0 || busy}>
          {save.isPending ? "저장 중" : existing ? "리뷰 수정" : "리뷰 남기기"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
        >
          그만두기
        </Button>

        {existing && (
          <div className="ml-auto">
            <ConfirmDialog
              trigger={
                <Button variant="danger" size="sm" disabled={busy}>
                  리뷰 삭제
                </Button>
              }
              title="리뷰를 지울까요?"
              description="지운 리뷰는 되돌릴 수 없어요. 사진도 함께 지워집니다."
              confirmLabel="리뷰 삭제"
              onConfirm={() => remove.mutate()}
            />
          </div>
        )}
      </div>
    </form>
  );
}
