"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 밥값 내기 (2026-08-09 요청). **제비뽑기로 다시 만들었다** (2026-08-12 요청).
 *
 * 예전에는 숫자가 드르륵 굴러가다 하나에 멈췄다. 결과는 같지만 **뽑는 사람이
 * 없었다** — 버튼을 누른 사람 하나가 답을 받아 읽어 주는 그림이라, 여럿이
 * 둘러앉아 하는 일에는 안 맞았다. 지금은 접힌 제비가 인원수만큼 깔리고
 * **한 사람씩 한 장을 연다.** 여는 차례가 곧 사람 차례다.
 *
 * **이름을 안 받는다.** 이 앱에는 신원이 없고(SPEC §2.4) 매번 이름을 치는 건
 * 점심시간에 할 일이 아니다. 제비에 번호만 적어 두면, 번호로 나눠 갖든 그냥
 * 아무 장이나 집든 둘 다 굴러간다.
 *
 * **뽑기를 클라이언트에서 한다.** CLAUDE.md 의 "추천 결과는 서버가 결정한다" 는
 * 규칙은 여기 안 걸린다. 그 규칙이 있는 이유는 추천의 후보 풀이 서버에 있기
 * 때문이다 — RLS 로 걸러지고, 최근 간 곳을 빼고, 평점 가중을 준다. 여기는 입력이
 * "숫자 하나" 뿐이라 서버에 물어봐도 서버가 아는 게 없다. 왕복만 늘고 오프라인에서
 * 못 쓰게 된다.
 *
 * **당첨은 한 판이 시작될 때 이미 정해져 있다.** 여는 순간에 정하면, 마지막
 * 한 장이 남았을 때 그 장이 당첨일 확률이 1이 아니게 되거나(다시 굴리면)
 * 반대로 앞에서 나올 수가 없어진다. 종이 제비도 접는 순간 이미 정해져 있다 —
 * 여는 것은 확인이지 추첨이 아니다.
 */

const MIN = 2;
const MAX = 20;
/** 제비 한 장이 펼쳐지는 시간. globals.css 의 `--animate-slip-open` 과 같은 값 */
const FLIP_MS = 340;

/**
 * 뒤집기 가운데에서 앞뒤를 바꾼다. 종이가 모로 서서 안 보이는 순간이라
 * 바뀌는 게 안 보인다 — 0에 바꾸면 펼치기도 전에 답이 보인다.
 *
 * 움직임을 줄여 달라고 했으면 **기다리지 않는다.** 전역 미디어쿼리가 애니메이션은
 * 0.01ms 로 줄여 주지만 이 타이머는 CSS 가 아니라서 안 줄어든다. 그대로 두면
 * 연출은 없는데 답만 0.17초 늦게 나오는, 그냥 굼뜬 화면이 된다.
 */
function swapDelay() {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduce ? 0 : FLIP_MS / 2;
}

export function BillView() {
  const [people, setPeople] = useState(3);
  /** 밥값을 내는 제비. 한 판이 시작될 때 정해진다 */
  const [payer, setPayer] = useState<number | null>(null);
  /** 펼친 제비들. 넣은 순서가 곧 뽑은 순서다 */
  const [opened, setOpened] = useState<number[]>([]);
  /** 지금 펼쳐지는 중인 한 장 */
  const [flipping, setFlipping] = useState<number | null>(null);

  // 타이머를 정리하지 않으면 모달을 닫은 뒤에도 상태를 건드린다.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  /**
   * 새 판. 인원이 바뀌면 자동으로 다시 접는다 — "4명 중 5번" 이 남으면 안 된다.
   * `Math.random()` 은 서버에 없어도 되는 값이라 이펙트 안에서만 부른다.
   */
  useEffect(() => {
    setPayer(1 + Math.floor(Math.random() * people));
    setOpened([]);
    setFlipping(null);
  }, [people]);

  const done = payer !== null && opened.includes(payer);

  const openSlip = (n: number) => {
    if (done || opened.includes(n) || flipping !== null) return;
    setFlipping(n);
    const t = setTimeout(() => {
      setOpened((prev) => [...prev, n]);
      setFlipping(null);
    }, swapDelay());
    timers.current.push(t);
  };

  const reshuffle = () => {
    setPayer(1 + Math.floor(Math.random() * people));
    setOpened([]);
    setFlipping(null);
  };

  const bump = (delta: number) =>
    setPeople((n) => Math.min(MAX, Math.max(MIN, n + delta)));

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

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        {/* 다섯 줄로 고정한다. 인원에 따라 열을 바꾸면 같은 화면이 매번 다른
            모양이 되고, 360px 에서 스무 장이 한 줄에 못 들어간다. */}
        <ul className="grid grid-cols-5 gap-2">
          {Array.from({ length: people }, (_, i) => i + 1).map((n) => (
            <li key={n}>
              <Slip
                n={n}
                state={
                  opened.includes(n)
                    ? n === payer
                      ? "payer"
                      : "miss"
                    : "closed"
                }
                flipping={flipping === n}
                locked={done || flipping !== null}
                onOpen={() => openSlip(n)}
              />
            </li>
          ))}
        </ul>

        {/* 결과는 글자로 알린다. 제비 색만 바뀌면 스크린리더가 아무 말도 안 한다 */}
        <p aria-live="polite" className="text-body">
          {done
            ? `${payer}번이 내는 걸로`
            : opened.length === 0
              ? "한 장씩 뽑아 주세요"
              : `${opened.length}장 열었어요. 다음 분 뽑으세요`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* 뽑는 건 제비를 누르는 것이다. 이 버튼은 **다시 접는** 버튼이라
            이름도 그렇게 쓴다 — "다시 뽑기" 면 이걸 눌러야 뽑히는 줄 안다. */}
        <Button variant={done ? "primary" : "outline"} onClick={reshuffle}>
          다시 접기
        </Button>
        {/* 번호를 누가 가질지는 앱이 모른다. 그 사실을 숨기지 않고 적는다 */}
        <p className="text-caption text-muted-foreground">
          번호는 서로 정해 주세요. 앱은 누가 몇 번인지 몰라요
        </p>
      </div>
    </div>
  );
}

/**
 * 제비 한 장.
 *
 * 접힌 면에는 번호와 접힌 자리(점선)만 있다. 편 면에는 「꽝」이나 「밥값」이
 * 글자로 박힌다 — 색만으로 알리지 않는다는 규칙이 여기서 제일 중요하다.
 * 당첨과 꽝을 색으로만 갈라 놓으면 그게 곧 못 읽는 결과가 된다.
 */
function Slip({
  n,
  state,
  flipping,
  locked,
  onOpen,
}: {
  n: number;
  state: "closed" | "miss" | "payer";
  /** 지금 펼쳐지는 중. 애니메이션은 이 한 장에만 건다 */
  flipping: boolean;
  /** 판이 끝났거나 다른 장이 펼쳐지는 중이라 지금은 못 연다 */
  locked: boolean;
  onOpen: () => void;
}) {
  // 판이 끝난 뒤 남은 제비는 **접힌 채로 물러난다.** 흰 바탕 그대로 두면
  // 아직 누를 수 있는 것처럼 보이는데 눌러도 안 열린다. 글자를 흐리게
  // 하지는 않는다 — 투명도를 씌우면 번호 대비가 4.5:1 아래로 떨어진다.
  const face =
    state === "payer"
      ? "border border-primary bg-primary text-primary-foreground"
      : state === "miss"
        ? "border border-border bg-muted text-muted-foreground"
        : locked
          ? "border border-border bg-muted text-muted-foreground"
          : "border border-border bg-background hover:bg-muted";

  return (
    <button
      type="button"
      // 편 제비는 다시 못 연다. 끝난 판에서는 나머지도 잠근다 — 답이 나온 뒤에도
      // 열리면 "아직 더 뽑아야 하나" 로 읽힌다.
      disabled={state !== "closed" || locked}
      // 눌러도 되는지는 보이는 것과 이름이 같이 말한다.
      aria-label={
        state === "closed"
          ? `${n}번 제비 뽑기`
          : state === "payer"
            ? `${n}번 — 밥값`
            : `${n}번 — 꽝`
      }
      onClick={onOpen}
      // 잠겨도 자리는 그대로 둔다. 몇 장이 남았는지가 보여야 한다.
      className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-md ${face}`}
      style={flipping ? { animation: "var(--animate-slip-open)" } : undefined}
    >
      <span className="tnum text-label">{n}</span>
      {state === "closed" ? (
        // 접힌 자리. 이게 있어야 종이 조각으로 읽힌다
        <span
          aria-hidden="true"
          className="w-1/2 border-b border-dashed border-border"
        />
      ) : (
        <span className="text-caption font-medium">
          {state === "payer" ? "밥값" : "꽝"}
        </span>
      )}
    </button>
  );
}
