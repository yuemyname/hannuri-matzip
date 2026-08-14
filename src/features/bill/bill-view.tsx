"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 밥값 내기 (2026-08-09 요청).
 * **제비뽑기 / 사다리 중에 골라서 한다** (2026-08-12 요청).
 *
 * 예전에는 숫자가 드르륵 굴러가다 하나에 멈췄다. 결과는 같지만 **뽑는 사람이
 * 없었다** — 버튼을 누른 사람 하나가 답을 받아 읽어 주는 그림이라, 여럿이
 * 둘러앉아 하는 일에는 안 맞았다. 지금은 둘 다 **한 사람이 하나씩 고른다.**
 * 고르는 차례가 곧 사람 차례다.
 *
 * **두 놀이가 같은 뼈대를 쓴다.** 인원, 밥값을 낼 번호(`payer`), 이미 열어 본
 * 번호(`opened`) — 여기까지는 같고, 다른 것은 그림과 여는 방법뿐이다. 결과 줄과
 * 다시 하기 버튼도 하나로 둔다. 놀이마다 화면을 통째로 따로 만들면 "밥값 내기"
 * 가 둘이 되고, 한쪽만 고쳐 놓는 일이 생긴다.
 *
 * **이름을 안 받는다.** 이 앱에는 신원이 없고(SPEC §2.4) 매번 이름을 치는 건
 * 점심시간에 할 일이 아니다. 번호만 있으면, 번호를 나눠 갖든 아무거나 집든
 * 둘 다 굴러간다.
 *
 * **뽑기를 클라이언트에서 한다.** CLAUDE.md 의 "추천 결과는 서버가 결정한다" 는
 * 규칙은 여기 안 걸린다. 그 규칙이 있는 이유는 추천의 후보 풀이 서버에 있기
 * 때문이다 — RLS 로 걸러지고, 최근 간 곳을 빼고, 평점 가중을 준다. 여기는 입력이
 * "숫자 하나" 뿐이라 서버에 물어봐도 서버가 아는 게 없다. 왕복만 늘고 오프라인에서
 * 못 쓰게 된다.
 *
 * **당첨은 한 판이 시작될 때 이미 정해져 있다.** 여는 순간에 정하면, 마지막
 * 하나가 남았을 때 그게 당첨일 확률이 1이 아니게 되거나 반대로 앞에서 나올 수가
 * 없어진다. 종이 제비도 사다리도 **놓는 순간** 이미 정해져 있다 — 여는 것은
 * 확인이지 추첨이 아니다.
 */

const MIN = 2;
const MAX = 20;

type Game = "slip" | "ladder";
const GAMES: { key: Game; label: string }[] = [
  { key: "slip", label: "제비뽑기" },
  { key: "ladder", label: "사다리" },
];

/**
 * 열린 칸에 적히는 말 (2026-08-12 요청: 꽝 → 냐미, 밥값 → 잘먹었습니다).
 * 한 군데서만 적는다 — 제비와 사다리가 같은 말을 써야 두 놀이가 한 화면으로 읽힌다.
 */
const PAY = "잘먹었습니다";
const FREE = "냐미";

/** 제비 한 장이 펼쳐지는 시간. globals.css 의 `--animate-slip-open` 과 같은 값 */
const FLIP_MS = 340;
/** 사다리 한 줄을 다 긋는 시간. `--animate-ladder-trace` 와 같은 값 */
const TRACE_MS = 750;

/**
 * 연출이 끝나기를 기다리는 시간.
 *
 * 움직임을 줄여 달라고 했으면 **기다리지 않는다.** 전역 미디어쿼리가 애니메이션은
 * 0.01ms 로 줄여 주지만 이 타이머는 CSS 가 아니라서 안 줄어든다. 그대로 두면
 * 연출은 없는데 답만 늦게 나오는, 그냥 굼뜬 화면이 된다.
 */
function waitFor(ms: number) {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? 0
    : ms;
}

/**
 * 당첨을 뽑는다. **한 판이 시작될 때 한 번**이고, 서로 다른 번호가 나온다.
 * (같은 번호가 두 번 뽑히면 당첨자 수가 조용히 줄어든다)
 */
function drawPayers(people: number, winners: number): number[] {
  const pool = Array.from({ length: people }, (_, i) => i + 1);
  const out: number[] = [];
  for (let k = 0; k < Math.min(winners, people); k++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out.sort((a, b) => a - b);
}

export function BillView() {
  const [game, setGame] = useState<Game>("slip");
  const [people, setPeople] = useState(3);
  /**
   * 몇 명이 낼지 (2026-08-12 요청). 한 명은 남겨 둔다 — 전원이 당첨이면
   * 뽑을 게 없다.
   */
  const [winners, setWinners] = useState(1);
  /** 밥값을 내는 번호들. 한 판이 시작될 때 정해진다 */
  const [payers, setPayers] = useState<number[]>([]);
  /** 사다리 가로줄. 판마다 새로 놓는다 (제비뽑기에서는 안 쓴다) */
  const [rungs, setRungs] = useState<boolean[][]>([]);
  /** 이미 열어 본 번호들. 넣은 순서가 곧 뽑은 순서다 */
  const [opened, setOpened] = useState<number[]>([]);
  /** 지금 열리는 중인 하나 */
  const [busy, setBusy] = useState<number | null>(null);
  /** [한 번에 펼치기] 가 도는 중. 도는 동안은 손으로 못 연다 */
  const [sweeping, setSweeping] = useState(false);

  // 타이머를 정리하지 않으면 모달을 닫은 뒤에도 상태를 건드린다.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  /**
   * 새 판. 인원이나 놀이가 바뀌면 자동으로 다시 깐다 — "4명 중 5번" 이 남으면
   * 안 된다. `Math.random()` 은 서버에 없어도 되는 값이라 이펙트 안에서만 부른다.
   */
  const deal = (n: number, w: number) => {
    // 펼치는 중에 다시 깔면 남은 타이머가 새 판을 열어 버린다. 먼저 걷는다.
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setPayers(drawPayers(n, w));
    setRungs(makeRungs(n));
    setOpened([]);
    setBusy(null);
    setSweeping(false);
  };
  useEffect(() => {
    deal(people, Math.min(winners, people - 1));
  }, [people, winners, game]);

  // 당첨을 **다 찾으면** 끝이다. 하나라도 안 나왔으면 아직 뽑을 게 남아 있다.
  const done =
    payers.length > 0 && payers.every((p) => opened.includes(p));

  const open = (n: number) => {
    if (done || sweeping || opened.includes(n) || busy !== null) return;
    setBusy(n);
    const t = setTimeout(
      () => {
        setOpened((prev) => [...prev, n]);
        setBusy(null);
      },
      waitFor(game === "slip" ? FLIP_MS / 2 : TRACE_MS),
    );
    timers.current.push(t);
  };

  /**
   * 남은 제비를 **한 번에 다 편다** (2026-08-12 요청). 둘이서 눈치만 보다
   * 끝내고 싶은 날이 있다 — 한 장씩이 규칙이 아니라 기본값일 뿐이다.
   *
   * 다만 동시에 확 펴지 않고 **왼쪽부터 물결로** 편다. 스무 장이 한 프레임에
   * 뒤집히면 어느 장이 당첨인지 눈이 못 쫓는다. 당첨을 다 찾아도 멈추지 않고
   * 끝까지 편다 — "다 펼치기" 를 눌렀는데 몇 장이 접힌 채 남으면 그게 더 이상하다.
   */
  const openAll = () => {
    if (done || sweeping || busy !== null) return;
    const rest = Array.from({ length: people }, (_, i) => i + 1).filter(
      (n) => !opened.includes(n),
    );
    if (rest.length === 0) return;
    const step = waitFor(FLIP_MS / 2);
    // 움직임을 줄여 달라고 했으면 물결도 없다. 한 번에 다 편다.
    if (step === 0) {
      setOpened((prev) => [...prev, ...rest]);
      return;
    }
    setSweeping(true);
    rest.forEach((n, i) => {
      timers.current.push(
        setTimeout(() => setBusy(n), i * step),
        setTimeout(() => {
          setOpened((prev) => [...prev, n]);
          setBusy(null);
        }, i * step + step),
      );
    });
    timers.current.push(
      setTimeout(() => setSweeping(false), rest.length * step),
    );
  };

  const bump = (delta: number) =>
    setPeople((n) => {
      const next = Math.min(MAX, Math.max(MIN, n + delta));
      // 사람이 줄면 당첨자 수도 따라 줄어야 한다. "3명 중 4명이 낸다" 는 없다.
      setWinners((w) => Math.min(w, next - 1));
      return next;
    });
  const bumpWinners = (delta: number) =>
    setWinners((w) => Math.min(people - 1, Math.max(1, w + delta)));

  const status = done
    ? `${payers.join("번, ")}번이 내는 걸로`
    : opened.length === 0
      ? game === "slip"
        ? "한 장씩 뽑아 주세요"
        : "줄을 하나 골라 주세요"
      : game === "slip"
        ? `${opened.length}장 열었어요. 다음 분 뽑으세요`
        : `${opened.length}줄 탔어요. 다음 분 고르세요`;

  return (
    <div className="flex flex-col gap-5">
      {/* 놀이 고르기. 결과는 어느 쪽이나 같으니 **취향 문제**고, 그래서 위에 둔다 —
          인원보다 먼저 정하는 것이 자연스럽다 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">어떻게 정할까요</legend>
        <div
          role="group"
          className="flex gap-1 self-start rounded-chip border border-border p-1"
        >
          {GAMES.map((g) => (
            <button
              key={g.key}
              type="button"
              // 고른 쪽을 색으로만 알리지 않는다. aria-pressed 가 소리로도 읽힌다.
              aria-pressed={game === g.key}
              onClick={() => setGame(g.key)}
              className={`rounded-chip px-3 py-1.5 text-label transition-colors ${
                game === g.key
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>

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

      {/* 당첨자 수 (2026-08-12 요청). 회식비를 둘이 나눠 내는 날이 있다.
          **한 명은 남겨 둔다** — 전원이 당첨이면 뽑을 것이 없다. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">몇 명이 낼까요</legend>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            aria-label="내는 사람 줄이기"
            disabled={winners <= 1}
            onClick={() => bumpWinners(-1)}
          >
            −
          </Button>
          <output className="tnum min-w-16 text-center text-display">
            {winners}
          </output>
          <Button
            variant="outline"
            aria-label="내는 사람 늘리기"
            disabled={winners >= people - 1}
            onClick={() => bumpWinners(1)}
          >
            +
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          {people - 1}명까지 정할 수 있어요
        </p>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        {game === "slip" ? (
          <>
            <Slips
              people={people}
              payers={payers}
              opened={opened}
              busy={busy}
              locked={done || busy !== null || sweeping}
              onOpen={open}
            />
            {/* 둘이서 눈치만 보다 끝내고 싶은 날. 한 장씩은 기본값이지 규칙이
                아니다. 판이 끝났으면 펼 것이 없으니 버튼도 없다. */}
            {!done && opened.length < people && (
              <Button
                variant="outline"
                disabled={sweeping || busy !== null}
                onClick={openAll}
              >
                {sweeping ? "펼치는 중" : "한 번에 펼치기"}
              </Button>
            )}
          </>
        ) : (
          <Ladder
            people={people}
            rungs={rungs}
            payers={payers}
            opened={opened}
            busy={busy}
            done={done}
            onOpen={open}
          />
        )}

        {/* 결과는 글자로 알린다. 칸 색만 바뀌면 스크린리더가 아무 말도 안 한다 */}
        <p aria-live="polite" className="text-body">
          {status}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {/* 뽑는 건 제비를 누르거나 줄을 고르는 것이다. 이 버튼은 **다시 까는**
            버튼이라 이름도 그렇게 쓴다 — "다시 뽑기" 면 이걸 눌러야 뽑히는 줄 안다. */}
        <Button
          variant={done ? "primary" : "outline"}
          onClick={() => deal(people, winners)}
        >
          {game === "slip" ? "다시 접기" : "다시 놓기"}
        </Button>
        {/* 번호를 누가 가질지는 앱이 모른다. 그 사실을 숨기지 않고 적는다 */}
        <p className="text-caption text-muted-foreground">
          번호는 서로 정해 주세요. 앱은 누가 몇 번인지 몰라요
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────── 제비뽑기 ────────────────────────── */

function Slips({
  people,
  payers,
  opened,
  busy,
  locked,
  onOpen,
}: {
  people: number;
  payers: number[];
  opened: number[];
  busy: number | null;
  /** 판이 끝났거나, 다른 장이 펼쳐지는 중이거나, 한 번에 펼치는 중 */
  locked: boolean;
  onOpen: (n: number) => void;
}) {
  return (
    // 네 줄로 고정한다. 인원에 따라 열을 바꾸면 같은 화면이 매번 다른 모양이 되고,
    // 360px 에서 스무 장이 한 줄에 못 들어간다. 다섯 줄이던 것을 넷으로 줄였다 —
    // 「잘먹었습니다」가 들어가려면 이 정도 폭은 있어야 한다 (2026-08-12).
    <ul className="grid grid-cols-4 gap-2">
      {Array.from({ length: people }, (_, i) => i + 1).map((n) => (
        <li key={n}>
          <Slip
            n={n}
            state={
              opened.includes(n)
                ? payers.includes(n)
                  ? "payer"
                  : "miss"
                : "closed"
            }
            flipping={busy === n}
            locked={locked}
            onOpen={() => onOpen(n)}
          />
        </li>
      ))}
    </ul>
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
          : `${n}번 — ${state === "payer" ? PAY : FREE}`
      }
      onClick={onOpen}
      // 잠겨도 자리는 그대로 둔다. 몇 장이 남았는지가 보여야 한다.
      className={`flex aspect-[4/5] w-full flex-col items-center justify-center gap-0.5 rounded-md px-1 ${face}`}
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
        // 「잘먹었습니다」는 한 줄에 안 들어간다. 잘라서 「잘먹었…」 로 두면
        // 무슨 말인지 알 수 없으니 줄을 바꿔 다 보여 준다. `text-balance` 로
        // 두 줄을 고르게 나눈다 — 그냥 두면 「잘먹었습니 / 다」 로 끊긴다.
        <span className="text-center text-caption leading-tight font-medium text-balance">
          {state === "payer" ? PAY : FREE}
        </span>
      )}
    </button>
  );
}

/* ────────────────────────── 사다리 ────────────────────────── */

/** 사다리 좌표계 한 칸. 뷰박스 안의 값이라 화면 크기와 무관하다 */
const CELL = 10;
/**
 * 세로줄 하나가 화면에서 차지할 최소 너비. 손가락이 닿을 만큼은 되어야 하고,
 * 아래 칸에 「잘먹었습니다」가 두 줄로 들어갈 만큼은 되어야 한다 (2026-08-12).
 */
const COL_REM = 3.5;
/** 사다리 그림의 높이 */
const LADDER_REM = 11;

/** 가로줄 층 수. 인원이 늘면 같이 늘리되 너무 촘촘해지지 않게 막는다 */
function rowsFor(people: number) {
  return Math.min(12, Math.max(5, people + 1));
}

/**
 * 가로줄을 놓는다. `rungs[층][i]` = i번 세로줄과 i+1번 세로줄 사이에 줄이 있다.
 *
 * **한 층에서 이웃한 두 자리에 같이 놓지 않는다.** 붙여 놓으면 한 층에서 두 칸을
 * 건너뛰게 되는데, 그건 사다리가 아니라 그냥 뒤섞기다 (눈으로 따라갈 수도 없다).
 */
function makeRungs(people: number): boolean[][] {
  const rows = rowsFor(people);
  const out: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = new Array<boolean>(Math.max(0, people - 1)).fill(false);
    for (let i = 0; i < row.length; i++) {
      if (i > 0 && row[i - 1]) continue;
      if (Math.random() < 0.45) row[i] = true;
    }
    out.push(row);
  }
  // 한 줄도 없으면 사다리가 아니라 세로줄 몇 개다. 그때만 하나 끼워 넣는다.
  if (people >= 2 && !out.some((row) => row.some(Boolean))) {
    out[Math.floor(rows / 2)][Math.floor(Math.random() * (people - 1))] = true;
  }
  return out;
}

/** 세로줄 i 의 x 좌표 (칸 한가운데) */
const colX = (i: number) => i * CELL + CELL / 2;

/**
 * 위에서 `top`번 줄로 내려가는 길. 사다리를 그대로 따라 내려간다.
 * 그리는 데 쓸 `d` 와 도착한 세로줄 번호를 함께 돌려준다.
 */
function trace(top: number, rungs: boolean[][]) {
  let c = top - 1;
  const parts = [`M ${colX(c)} 0`];
  rungs.forEach((row, r) => {
    const y = (r + 1) * CELL;
    parts.push(`L ${colX(c)} ${y}`);
    if (c > 0 && row[c - 1]) c -= 1;
    else if (c < row.length && row[c]) c += 1;
    else return;
    parts.push(`L ${colX(c)} ${y}`);
  });
  parts.push(`L ${colX(c)} ${(rungs.length + 1) * CELL}`);
  return { d: parts.join(" "), end: c + 1 };
}

/**
 * 사다리타기.
 *
 * 위 번호를 하나 고르면 줄이 그어지며 내려가고, 도착한 자리가 열린다. 아래
 * 칸은 **닿기 전에는 「?」** 다 — 다 보여 주면 눈으로 따라가서 답을 미리 알 수
 * 있고, 그러면 남은 사람들이 고를 이유가 없어진다.
 *
 * 그림은 SVG 다. 세로줄·가로줄은 선 하나씩이라 캔버스를 쓸 이유가 없고,
 * 색도 클래스(`stroke-border`)로 줄 수 있어 토큰이 코드로 새지 않는다.
 */
function Ladder({
  people,
  rungs,
  payers,
  opened,
  busy,
  done,
  onOpen,
}: {
  people: number;
  rungs: boolean[][];
  payers: number[];
  opened: number[];
  busy: number | null;
  done: boolean;
  onOpen: (n: number) => void;
}) {
  const paths = useMemo(
    () =>
      rungs.length === 0
        ? []
        : Array.from({ length: people }, (_, i) => trace(i + 1, rungs)),
    [people, rungs],
  );
  if (paths.length === 0) return null;

  const H = (rungs.length + 1) * CELL;
  const W = people * CELL;
  /** 밥값이 걸린 아래 칸들. 여기로 내려오는 위 번호가 곧 당첨이다 */
  const payerEnds = payers.map((p) => paths[p - 1].end);
  /** 아래 칸 j 가 이미 열렸는가 = 거기로 내려온 위 번호가 하나라도 열렸는가 */
  const endOpened = (j: number) => opened.some((n) => paths[n - 1].end === j);
  // **밥값 줄을 맨 나중에 그린다.** 앞에 그리면 나중에 탄 줄이 그 위를 덮어서
  // 답이 중간에 끊긴 것처럼 보인다 (실제로 그렇게 보였다).
  const drawn = [...opened, ...(busy === null ? [] : [busy])].sort(
    (a, b) => Number(payers.includes(a)) - Number(payers.includes(b)),
  );

  return (
    // 스무 명이면 세로줄 스무 개다. 폭을 다 나눠 쓰면 손가락이 안 닿으니
    // **가로로 밀어서** 본다. 바깥 문서는 안 넘친다 (이 상자만 스크롤한다).
    <div className="-mx-1 overflow-x-auto px-1">
      <div style={{ minWidth: `${people * COL_REM}rem` }}>
        {/* 위 번호 = 고르는 자리. 칸 사이에 틈을 안 둔다 — 틈이 있으면 칸
            한가운데가 아래 세로줄과 어긋난다 */}
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${people}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: people }, (_, i) => i + 1).map((n) => {
            const taken = opened.includes(n);
            return (
              <li key={n} className="px-0.5">
                <button
                  type="button"
                  disabled={taken || done || busy !== null}
                  aria-label={
                    taken
                      ? `${n}번 — ${payers.includes(n) ? PAY : FREE}`
                      : `${n}번 줄 타기`
                  }
                  onClick={() => onOpen(n)}
                  className={`tnum w-full rounded-md border py-1 text-label ${
                    taken
                      ? payers.includes(n)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted text-muted-foreground"
                      : done
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              </li>
            );
          })}
        </ul>

        {/* 그림은 이름을 안 갖는다. 무엇이 일어났는지는 위아래 칸의 이름과
            바깥 aria-live 가 말한다 */}
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: `${LADDER_REM}rem` }}
        >
          {/* 세로줄. `vector-effect` 가 없으면 뷰박스를 늘린 만큼 선도 굵어진다 */}
          {Array.from({ length: people }, (_, i) => (
            <line
              key={i}
              x1={colX(i)}
              y1={0}
              x2={colX(i)}
              y2={H}
              className="stroke-border"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {rungs.map((row, r) =>
            row.map((on, i) =>
              on ? (
                <line
                  key={`${r}-${i}`}
                  x1={colX(i)}
                  y1={(r + 1) * CELL}
                  x2={colX(i + 1)}
                  y2={(r + 1) * CELL}
                  className="stroke-border"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            ),
          )}
          {/* 이미 탄 줄은 그대로 남는다. 누가 어디로 갔는지가 판 위에 쌓여야
              "다음은 어디" 를 서로 보고 정할 수 있다 */}
          {drawn.map((n) => (
            <path
              key={n}
              d={paths[n - 1].d}
              fill="none"
              // 지나간 줄은 한 톤 죽인다. 밥값 줄과 같은 굵기·같은 검정으로
              // 두면 사다리 가로줄까지 섞여 판이 그냥 새까매진다.
              className={
                payers.includes(n) ? "stroke-primary" : "stroke-muted-foreground"
              }
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              // 지금 그어지는 줄만 위에서부터 덮개를 걷는다 (`--animate-ladder-trace`).
              // 이미 탄 줄은 그냥 다 보인다.
              style={
                n === busy
                  ? { animation: "var(--animate-ladder-trace)" }
                  : undefined
              }
            />
          ))}
        </svg>

        {/* 아래 칸 = 결과. 닿기 전에는 「?」 다 */}
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${people}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: people }, (_, j) => j + 1).map((j) => {
            const shown = endOpened(j);
            const isPayer = payerEnds.includes(j);
            return (
              <li key={j} className="px-0.5">
                <span
                  className={`block rounded-md border px-0.5 py-1 text-center text-caption leading-tight text-balance ${
                    shown
                      ? isPayer
                        ? "border-primary bg-primary font-medium text-primary-foreground"
                        : "border-border bg-muted text-muted-foreground"
                      : "border-dashed border-border text-muted-foreground"
                  }`}
                >
                  {shown ? (isPayer ? PAY : FREE) : "?"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
