"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 밥값 내기 (2026-08-09 요청).
 *
 * **이름을 안 받는다.** 이 앱에는 신원이 없고(SPEC §2.4) 매번 이름을 치는 건
 * 점심시간에 할 일이 아니다. 인원수만 넣으면 번호가 나오고, 번호는 그 자리에서
 * 서로 정한다 — 사다리 타기가 이름을 안 물어도 굴러가는 것과 같은 이치다.
 *
 * **뽑기를 클라이언트에서 한다.** CLAUDE.md 의 "추천 결과는 서버가 결정한다" 는
 * 규칙은 여기 안 걸린다. 그 규칙이 있는 이유는 추천의 후보 풀이 서버에 있기
 * 때문이다 — RLS 로 걸러지고, 최근 간 곳을 빼고, 평점 가중을 준다. 여기는 입력이
 * "숫자 하나" 뿐이라 서버에 물어봐도 서버가 아는 게 없다. 왕복만 늘고 오프라인에서
 * 못 쓰게 된다.
 *
 * 다만 **뽑고 나서 연출한다**는 순서는 지킨다. 애니메이션이 결과를 정하면
 * 중간에 멈췄을 때 결과가 달라진다.
 */

const MIN = 2;
const MAX = 20;
/** 번호가 굴러가는 시간. globals.css 의 pick 연출과 같은 호흡으로 맞춘다 */
const ROLL_MS = 1100;
const TICK_MS = 70;

export function BillView() {
  const [people, setPeople] = useState(3);
  const [result, setResult] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(1);

  // 타이머를 정리하지 않으면 모달을 닫은 뒤에도 계속 돌아 상태를 건드린다.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const draw = () => {
    // **먼저 뽑고 나중에 굴린다.** 굴리는 중에 정하면 도중에 멈췄을 때 답이 달라진다.
    const picked = 1 + Math.floor(Math.random() * people);
    setResult(null);
    setRolling(true);

    const spin = setInterval(
      () => setFace(1 + Math.floor(Math.random() * people)),
      TICK_MS,
    );
    const stop = setTimeout(() => {
      clearInterval(spin);
      setFace(picked);
      setResult(picked);
      setRolling(false);
    }, ROLL_MS);
    timers.current.push(stop as unknown as ReturnType<typeof setTimeout>);
  };

  const bump = (delta: number) => {
    setPeople((n) => Math.min(MAX, Math.max(MIN, n + delta)));
    // 인원이 바뀌면 이전 결과는 뜻이 없어진다. "4명 중 5번" 이 남으면 안 된다.
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">몇 명이에요</legend>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            aria-label="한 명 줄이기"
            disabled={people <= MIN}
            onClick={() => bump(-1)}
          >
            −
          </Button>
          {/* 숫자 자체가 상태다. 인풋으로 두면 키보드가 올라와 자리를 먹는다 */}
          <output className="tnum min-w-16 text-center text-display">
            {people}
          </output>
          <Button
            variant="outline"
            aria-label="한 명 늘리기"
            disabled={people >= MAX}
            onClick={() => bump(1)}
          >
            +
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          {MIN}~{MAX}명까지 뽑을 수 있어요
        </p>
      </fieldset>

      <div className="flex flex-col items-center gap-2 rounded-lg border border-border p-6">
        <span
          aria-hidden="true"
          className={`tnum text-display ${rolling ? "text-muted-foreground" : "text-brand-700"}`}
        >
          {result ?? face}번
        </span>
        {/* 결과는 글자로도 알린다. 숫자만 바뀌면 스크린리더가 안 읽는다 */}
        <p aria-live="polite" className="text-body">
          {rolling
            ? "뽑는 중"
            : result === null
              ? "아직 안 뽑았어요"
              : `${result}번이 내는 걸로`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={draw} disabled={rolling}>
          {rolling ? "뽑는 중" : result === null ? "뽑기" : "다시 뽑기"}
        </Button>
        {/* 번호를 누가 가질지는 앱이 모른다. 그 사실을 숨기지 않고 적는다 */}
        <p className="text-caption text-muted-foreground">
          번호는 서로 정해 주세요. 앱은 누가 몇 번인지 몰라요
        </p>
      </div>
    </div>
  );
}
