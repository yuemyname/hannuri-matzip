"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FEEDBACK_MAX_LEN, feedbackError, sendFeedback } from "./api";

/**
 * 피드백 (2026-08-10 요청).
 *
 * **답장이 없는 통이다.** 이 앱에는 신원이 없어서(SPEC §2.4) 누구에게 답할지를
 * 물어볼 데가 없다. 그 사실을 숨기지 않고 화면에 적는다 — 답을 기다리게 두는 게
 * 제일 나쁘다.
 *
 * 보내고 나면 폼을 비우고 "또 쓸 수 있다" 는 걸 남긴다. 화면을 닫아 버리면
 * 한 번에 하나씩만 쓸 수 있게 되는데, 쓰다 보면 보통 두세 개가 이어진다.
 */
export function FeedbackView() {
  const [body, setBody] = useState("");
  const [sentCount, setSentCount] = useState(0);

  const problem = feedbackError(body);
  // 아직 아무것도 **안 친** 상태에 "내용을 적어 주세요" 를 띄우면 혼내는 것처럼
  // 보인다. 다만 공백만 친 경우는 다르다 — 버튼이 죽어 있는데 이유가 없으면
  // 고장으로 읽힌다. 그래서 trim 이 아니라 **친 글자가 있는지**로 가른다.
  const shownProblem = body.length > 0 ? problem : null;

  const send = useMutation({
    mutationFn: () => sendFeedback(body),
    onSuccess: () => {
      setBody("");
      setSentCount((n) => n + 1);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-muted-foreground">
        불편한 점, 있으면 좋겠는 기능 아무거나 적어 주세요. 익명이라 누가 썼는지는
        안 남고, 답장 대신 다음 배포에 반영해요
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium">하고 싶은 말</span>
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={FEEDBACK_MAX_LEN}
          placeholder="지도에서 마커가 겹쳐서 안 눌려요"
          aria-invalid={shownProblem !== null}
          aria-describedby="feedback-help"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 placeholder:text-ink-400"
        />
        <span
          id="feedback-help"
          className={`text-caption ${
            shownProblem ? "text-danger" : "text-muted-foreground"
          }`}
        >
          {/* 글자 수는 다 채워 갈 때만 알린다. 늘 떠 있으면 세면서 쓰게 된다 */}
          {shownProblem ??
            (body.length > FEEDBACK_MAX_LEN - 100
              ? `${body.length} / ${FEEDBACK_MAX_LEN}자`
              : "짧아도 괜찮아요")}
        </span>
      </label>

      {send.isError && (
        <p role="alert" className="text-caption text-danger">
          보내지 못했어요. 잠시 후 다시 눌러 주세요.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          disabled={problem !== null || send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? "보내는 중" : "보내기"}
        </Button>
        {/* 보냈다는 걸 이 자리에서 알린다. 화면을 닫아 버리면 이어서 못 쓴다 */}
        {sentCount > 0 && !send.isPending && (
          <span role="status" className="text-caption text-muted-foreground">
            {sentCount === 1
              ? "보냈어요. 더 있으면 이어서 적어 주세요"
              : `${sentCount}개 보냈어요`}
          </span>
        )}
      </div>
    </div>
  );
}
