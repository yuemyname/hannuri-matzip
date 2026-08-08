"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markWelcomeSeen } from "./seen";

/**
 * 첫 사용자 안내 3스텝 (WBS 6.4).
 * 모달과 풀페이지 fallback 이 이 컴포넌트 하나를 쓴다.
 *
 * 설명서를 읽히는 게 목적이 아니다. "여긴 뭘 하는 곳인가" 를 세 줄로 알리고
 * 비켜 주는 게 목적이다. 그래서 스텝마다 문장 하나씩만 둔다.
 */
const STEPS = [
  {
    title: "주변 맛집을 지도에서 봐요",
    body: "사무실에서 걸어갈 만한 거리만 보여줘요. 위쪽에서 반경과 종류를 바꿀 수 있어요",
  },
  {
    title: "다녀왔으면 한 줄 남겨요",
    body: "별점과 짧은 메모, 사진 3장까지. 다음 사람이 고를 때 이게 전부예요",
  },
  {
    title: "고르기 귀찮으면 점메추",
    body: "위쪽 [점메추] 를 누르면 한 곳을 뽑아줘요. 마음에 안 들면 다시 뽑으면 돼요",
  },
] as const;

export function WelcomeView() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // 뜬 순간 본 걸로 친다. 중간에 닫았다고 다음에 또 띄우면 그건 안내가 아니다.
  // 다시 보고 싶은 사람을 위해 `/me` 에 다시 보기 링크를 둔다.
  useEffect(() => markWelcomeSeen(), []);

  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  // 닫기 = 뒤로. 메인에서 push 로 열었으므로 back 이면 지도로 돌아간다 (SHELL.md §3).
  const done = () => router.back();

  return (
    <div className="flex flex-col gap-4">
      {/* 진행도를 점으로만 알리지 않는다. 숫자를 함께 쓴다 (CLAUDE.md) */}
      <p className="tnum text-caption text-muted-foreground">
        {step + 1} / {STEPS.length}
      </p>

      {/* 스텝이 바뀌면 새 내용을 읽어 준다. 화면은 그대로라 안 하면 조용히 바뀐다 */}
      <div aria-live="polite" className="flex min-h-28 flex-col gap-2">
        <h3 className="text-title">{current.title}</h3>
        <p className="text-muted-foreground">{current.body}</p>
      </div>

      <div className="flex items-center gap-2">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            이전
          </Button>
        )}

        {last ? (
          <Button className="ml-auto" onClick={done}>
            지도 보러 가기
          </Button>
        ) : (
          <>
            {/* 건너뛰기도 "봤다"로 친다 — 위 이펙트가 이미 표시해 뒀다 */}
            <Button variant="ghost" onClick={done}>
              건너뛰기
            </Button>
            <Button className="ml-auto" onClick={() => setStep((s) => s + 1)}>
              다음
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
