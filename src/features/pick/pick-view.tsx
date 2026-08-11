"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Button, buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CategoryChip } from "@/components/category-chip";
import { favoredAt } from "@/lib/moods";
import { reservationUrlError } from "@/lib/reservation";
import { Rating } from "@/components/rating";
import { Distance } from "@/components/distance";
import { categoryColorVar, type Category } from "@/lib/categories";
import { useCategories } from "@/features/categories/api";
import { OFFICE, RADIUS_OPTIONS } from "@/features/map/config";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { useMapView } from "@/features/map/map-store";
import { PRICE_LABEL, priceReasonAt } from "@/features/restaurants/price";
import type { NearbyRestaurant } from "@/features/restaurants/api";
import {
  answerPick,
  defaultMealType,
  pickRestaurant,
  type MealType,
} from "./api";

/** 응답을 받은 뒤 룰렛이 멈추기까지. 이 시간 동안 결과를 감춘다 */
const SHUFFLE_MS = 1200;
/** 응답을 기다리는 동안의 회전 속도(초당 각도). 한 바퀴에 약 0.9초 */
const FREE_SPIN_DPS = 400;
/** 멈출 때까지 도는 최소 바퀴 수. 적으면 "돌았다" 는 느낌이 안 난다 */
const LANDING_TURNS = 3;
/** SPEC §3.2 의 p_exclude_days 기본값 */
const EXCLUDE_DAYS = 7;

const MEALS: { key: MealType; label: string }[] = [
  { key: "lunch", label: "점심" },
  { key: "dinner", label: "저녁" },
];

export function PickView() {
  const router = useRouter();
  const { center: geoCenter, status } = useCurrentPosition();
  const mapCenter = useMapView((s) => s.center);
  const radiusFromMap = useMapView((s) => s.radius);
  const setSelectedId = useMapView((s) => s.setSelectedId);

  /**
   * 뽑는 기준점 — **지금 보고 있는 지도 한가운데다** (2026-08-10 수정).
   *
   * 예전에는 `useCurrentPosition().center` 만 봤다. 그 값은 GPS 를 못 얻으면
   * 조용히 사무실 좌표로 떨어지는데, 그래서 을지로3가를 보면서 뽑았더니 구의역
   * 식당이 나왔다 — 화면과 아무 상관 없는 자리에서 고르고 있었던 것이다.
   *
   * 지도 한가운데를 쓰면 사용자가 기준을 직접 옮길 수 있다 (지도를 끌면 된다).
   * 지도가 아직 없으면(풀페이지 fallback) 예전처럼 내 위치 → 사무실 순이다.
   * **어디를 기준으로 삼았는지는 화면에 적는다** — 이 버그의 핵심은 결과가
   * 틀린 게 아니라 어디 기준인지 알 방법이 없었다는 것이다.
   */
  const center = mapCenter ?? geoCenter;
  const usingMap = mapCenter !== null;

  // 시간대 기반 기본값 (SPEC §4.2). 서버 렌더와 어긋나지 않게 마운트 후에 정한다.
  const [meal, setMeal] = useState<MealType>("lunch");
  useEffect(() => setMeal(defaultMealType(new Date())), []);

  const [radius, setRadius] = useState(radiusFromMap);
  const [categories, setCategories] = useState<Category[]>([]);
  const categoryList = useCategories();
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [excludeRecent, setExcludeRecent] = useState(true);

  /**
   * **매번 전체에서 새로 뽑는다** (2026-08-10, 사용자 결정).
   *
   * 예전에는 이번 세션에서 뽑힌 곳을 모아 서버에 넘겨 제외시켰다 (WBS 4.4 DoD:
   * "연속 5회 재추첨에 같은 곳이 다시 나오지 않는다"). 사내 맛집은 한 동네에
   * 몇 곳뿐이라 두세 번이면 후보가 바닥나고, 그때부터는 뽑을 게 없다는 말만
   * 나왔다. 후보를 좁혀 가는 것보다 매번 새로 굴리는 쪽이 이 앱의 크기에 맞는다.
   *
   * 그래서 **같은 곳이 연달아 나올 수 있다.** 고장이 아니라는 걸 화면이 말한다.
   */
  const [draws, setDraws] = useState(0);
  const [repeated, setRepeated] = useState(false);
  const [result, setResult] = useState<NearbyRestaurant | null>(null);
  const [signatureMenu, setSignatureMenu] = useState<string | null>(null);
  const [reservationUrl, setReservationUrl] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [emptyPool, setEmptyPool] = useState(false);

  const pick = useMutation({
    mutationFn: () =>
      pickRestaurant({
        lat: center.lat,
        lng: center.lng,
        radiusM: radius,
        mealType: meal,
        categories,
        maxPrice,
        excludeDays: excludeRecent ? EXCLUDE_DAYS : 0,
      }),
    onSuccess: (r) => {
      setEmptyPool(r.restaurant === null);
      // 직전과 같은 곳인지 **이전 결과를 지우기 전에** 본다.
      setRepeated(
        r.restaurant !== null && result !== null && r.restaurant.id === result.id,
      );
      setResult(r.restaurant);
      setSignatureMenu(r.signatureMenu);
      setReservationUrl(r.reservationUrl);
      setLogId(r.logId);
      setDraws((n) => n + 1);
    },
  });

  /**
   * **결과는 응답으로 이미 정해져 있다.** 룰렛은 그 뒤에 도는 연출이다 (SPEC §3.2).
   *
   * 뽑을 게 없었으면 안 돌린다. 멈출 칸이 없는데 돌면 아무 칸에나 서게 되고,
   * 그건 "이게 나왔다" 로 읽힌다 — 실제로는 아무것도 안 나온 것이다.
   */
  const reduceMotion = useReducedMotion();
  const shuffling = useShuffle(
    pick.isSuccess && result !== null ? pick.submittedAt : null,
    reduceMotion,
  );

  /**
   * 판에 그릴 칸. 종류 목록 그대로지만, **뽑힌 종류는 반드시 들어 있어야 한다** —
   * 목록이 낡아 그 종류가 빠져 있으면 멈출 칸이 없어서 엉뚱한 칸에 선다.
   */
  const wheelLabels = useMemo(() => {
    const list = categoryList.data ?? [];
    if (result === null || list.includes(result.category)) return list;
    return [...list, result.category];
  }, [categoryList.data, result]);
  const showResult = pick.isSuccess && !shuffling;
  // 뽑힌 곳이 화면에 있는지. 있으면 위 버튼이 [다시 뽑기] 가 된다.
  // 후보가 0건이었을 때는 되뽑을 대상이 없으므로 [뽑아줘] 그대로다.
  const hasResult = showResult && result !== null;

  const toggle = (c: Category) =>
    setCategories((p) =>
      p.includes(c) ? p.filter((x) => x !== c) : [...p, c],
    );

  const accept = async () => {
    if (logId) await answerPick(logId, true);
    if (result) setSelectedId(result.id);
    // 모달을 닫으면 배경 지도가 그대로 있고, 선택된 마커로 강조된다 (WBS 4.4)
    router.back();
  };

  const again = async () => {
    if (logId) await answerPick(logId, false);
    pick.mutate();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* **어디를 기준으로 뽑는지 먼저 적는다.** 예전엔 이 줄이 없어서, GPS 를
          못 얻어 사무실 좌표로 떨어졌을 때 왜 엉뚱한 동네가 나오는지 알 길이
          없었다 (을지로에서 뽑았는데 구의역이 나온 게 그 경우다). */}
      <p className="text-caption text-muted-foreground">
        {usingMap
          ? "지금 보고 있는 지도 한가운데를 기준으로 찾아요. 다른 동네를 보려면 지도를 옮겨 주세요"
          : status === "granted"
            ? "내 위치를 기준으로 찾아요"
            : `위치를 못 얻어서 ${OFFICE.name}을 기준으로 찾아요`}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">언제</legend>
        <div
          role="group"
          className="flex gap-1 self-start rounded-chip border border-border p-1"
        >
          {MEALS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={meal === m.key}
              onClick={() => setMeal(m.key)}
              className={`rounded-chip px-3 py-1 text-label ${
                meal === m.key
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">반경</legend>
        <div
          role="group"
          className="flex gap-1 self-start rounded-chip border border-border p-1"
        >
          {RADIUS_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={radius === m}
              onClick={() => setRadius(m)}
              className={`tnum rounded-chip px-2.5 py-1 text-label ${
                radius === m
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">카테고리</legend>
        <div className="flex flex-wrap gap-2">
          {(categoryList.data ?? []).map((c) => (
            <CategoryChip
              key={c}
              category={c}
              selected={categories.includes(c)}
              onToggle={toggle}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">가격대</legend>
        <div role="group" className="flex flex-wrap gap-1">
          <PriceChip
            label="상관없음"
            active={maxPrice === null}
            onClick={() => setMaxPrice(null)}
          />
          {[1, 2, 3, 4].map((p) => (
            <PriceChip
              key={p}
              label={`${PRICE_LABEL[p]}까지`}
              active={maxPrice === p}
              onClick={() => setMaxPrice(p)}
            />
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2">
        <Switch checked={excludeRecent} onCheckedChange={setExcludeRecent} />
        {/* 색만으로 알리지 않도록 상태를 글자로도 쓴다 */}
        <span className="text-label">
          최근 {EXCLUDE_DAYS}일 안에 간 곳 빼기 {excludeRecent ? "켬" : "끔"}
        </span>
      </label>

      <div className="flex items-center gap-2">
        {/* 결과가 떠 있어도 이 버튼은 계속 보인다. 자리를 옮기지 않고 이름만
            바뀐다 — 조건을 고치고 바로 다시 뽑는 게 이 화면의 주 동작이라,
            버튼이 사라졌다 나타나면 매번 눈으로 다시 찾아야 한다.
            **[다시 뽑기] 는 여기 하나뿐이다.** 결과 카드 안에도 두면 같은 이름의
            버튼이 둘이 되어 어느 쪽인지 헷갈린다. */}
        <Button
          onClick={() => (hasResult ? void again() : pick.mutate())}
          disabled={pick.isPending || shuffling}
        >
          {pick.isPending || shuffling
            ? "고르는 중"
            : hasResult
              ? "다시 뽑기"
              : "뽑아줘"}
        </Button>
        {draws > 0 && (
          <span className="tnum text-caption text-muted-foreground">
            {draws}번 뽑음
          </span>
        )}
      </div>

      <div aria-live="polite" className="min-h-0">
        {/* 멈출 칸은 응답이 도착한 뒤에만 안다. 그 전까지는 그냥 돈다 */}
        {(pick.isPending || shuffling) && (
          <Roulette
            labels={wheelLabels}
            targetIndex={
              shuffling && result ? wheelLabels.indexOf(result.category) : null
            }
            reduce={reduceMotion}
          />
        )}

        {showResult && result && (
          <Result
            restaurant={result}
            signatureMenu={signatureMenu}
            reservationUrl={reservationUrl}
            meal={meal}
            repeated={repeated}
            onAccept={() => void accept()}
          />
        )}

        {showResult && emptyPool && (
          <Empty
            hasFilters={categories.length > 0 || maxPrice !== null}
            radius={radius}
            onWiden={() => {
              const next = RADIUS_OPTIONS.find((m) => m > radius);
              if (next) setRadius(next);
            }}
            canWiden={radius < RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]}
          />
        )}

        {pick.isError && (
          <p role="alert" className="text-caption text-danger">
            뽑지 못했어요. 다시 눌러 주세요.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 응답을 받은 뒤 `SHUFFLE_MS` 동안 true. 그 사이 결과를 감춘다.
 *
 * **결과는 이미 손에 있다.** 애니메이션이 결과를 정하지 않는다 —
 * 네트워크가 느려도 셔플 도중 값이 바뀌지 않는 이유가 이것이다 (WBS 4.3 DoD).
 * `prefers-reduced-motion` 이면 셔플을 건너뛰고 즉시 보여준다.
 */
function useShuffle(startedAt: number | null, reduce: boolean) {
  const [running, setRunning] = useState(false);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt === null || startedAt === last.current) return;
    last.current = startedAt;

    if (reduce) {
      setRunning(false);
      return;
    }

    setRunning(true);
    const t = setTimeout(() => setRunning(false), SHUFFLE_MS);
    return () => clearTimeout(t);
  }, [startedAt, reduce]);

  return running;
}

/**
 * 움직임을 줄여 달라고 했는지 (CLAUDE.md 접근성).
 *
 * 전역 미디어쿼리가 CSS 애니메이션은 이미 0.01ms 로 줄이지만, 여기는 rAF 로
 * 도는 자바스크립트 연출이라 CSS 가 못 막는다. 값으로 받아서 아예 안 켠다.
 * 서버에는 `matchMedia` 가 없으므로 첫 렌더는 항상 false 로 시작한다.
 */
function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

/**
 * 고르는 중 연출 — **룰렛** (2026-08-11 요청, 진행 바에서 교체).
 *
 * 바를 쓰던 이유는 "얼마나 남았나" 를 보여주기 위해서였는데, 1.2초짜리에
 * 남은 시간은 알 필요가 없는 정보였다. 룰렛은 남은 시간 대신 **무엇을 뽑는
 * 중인지**를 보여준다 — 칸 하나가 종류 하나고, 멈춘 칸이 곧 답이다.
 *
 * 두 상태를 구분하는 건 바와 똑같다. 이게 핵심이다:
 * - `targetIndex === null` — 아직 응답을 기다린다. 어디에 멈출지 모르니 **일정한
 *   속도로 계속 돈다.** 여기서 감속을 시작하면 "곧 멈춘다" 는 거짓말이 된다.
 * - 숫자가 들어오면 — 응답이 왔고 답도 정해졌다. 그 칸에 오도록 몇 바퀴 더 돌며
 *   감속한다. **판이 답을 정하는 게 아니라 답이 판을 세운다** (CLAUDE.md:
 *   추천 결과는 서버가 결정한다).
 *
 * 판은 `aria-hidden` 이다. 답은 바깥 `aria-live` 가 결과 카드로 읽어 준다.
 * 색만으로 알리지 않는다는 규칙은 가운데의 **칸 이름 글자**가 지킨다.
 *
 * 회전은 rAF 로 직접 돌린다. CSS 애니메이션 → 트랜지션으로 갈아타면 그 순간
 * 각도가 튀는데(애니메이션 중의 값은 트랜지션의 시작점이 아니다), 각도를 한
 * 곳에서 들고 있으면 그 문제가 아예 없다.
 */
function Roulette({
  labels,
  targetIndex,
  reduce,
}: {
  labels: readonly Category[];
  /** 멈출 칸. null 이면 아직 응답 전이라 계속 돈다 */
  targetIndex: number | null;
  /** 움직임을 줄여 달라고 한 사람에게는 안 돌린다 */
  reduce: boolean;
}) {
  const discRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const angle = useRef(0);
  /** 감속 구간. null 이면 등속으로 도는 중이다 */
  const landing = useRef<{ from: number; to: number; start: number } | null>(
    null,
  );

  const n = labels.length;

  useEffect(() => {
    if (targetIndex === null || n === 0) {
      landing.current = null;
      return;
    }
    const step = 360 / n;
    // 칸 i 는 판 좌표로 [i*step, (i+1)*step). 바늘은 12시에 고정이라, 판을 R 만큼
    // 돌리면 12시에 오는 칸 좌표는 (360 - R). 그게 칸 한가운데가 되게 R 을 고른다.
    const want = (((360 - (targetIndex + 0.5) * step) % 360) + 360) % 360;
    const from = angle.current;
    // **앞으로만 돈다.** 뒤로 감기면 룰렛이 아니라 되감기로 보인다.
    let to = Math.ceil(from / 360) * 360 + LANDING_TURNS * 360 + want;
    while (to <= from) to += 360;
    landing.current = { from, to, start: performance.now() };
  }, [targetIndex, n]);

  useEffect(() => {
    if (reduce || n === 0) return;
    let raf = 0;
    let prev = performance.now();
    const paint = (now: number) => {
      const dt = now - prev;
      prev = now;
      const land = landing.current;
      if (land) {
        const t = Math.min((now - land.start) / SHUFFLE_MS, 1);
        // 세제곱 ease-out. 마지막에 느려지는 것이 룰렛의 전부다.
        angle.current = land.from + (land.to - land.from) * (1 - (1 - t) ** 3);
      } else {
        angle.current += (dt / 1000) * FREE_SPIN_DPS;
      }
      if (discRef.current) {
        discRef.current.style.transform = `rotate(${angle.current}deg)`;
      }
      if (labelRef.current) {
        // 지금 바늘 아래 있는 칸. 매 프레임 setState 하면 렌더가 60번 돈다 —
        // 장식이라 DOM 에 직접 쓴다 (판과 같은 이유로 aria-hidden 안쪽이다).
        const at = (((360 - (angle.current % 360)) % 360) + 360) % 360;
        const name = labels[Math.floor(at / (360 / n)) % n];
        if (labelRef.current.textContent !== name) {
          labelRef.current.textContent = name;
        }
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [labels, n, reduce]);

  // 종류가 하나뿐이면 판이 될 수 없다. 그때는 글자만 남긴다 —
  // 칸이 하나인 룰렛은 돌 이유가 없고, 돌면 오히려 고장으로 보인다.
  const drawable = n >= 2;
  const step = 360 / Math.max(n, 1);
  const stops = labels
    .map((c, i) => `var(${categoryColorVar(c)}) ${i * step}deg ${(i + 1) * step}deg`)
    .join(", ");

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-6">
      {drawable && (
        <div aria-hidden="true" className="relative size-40">
          {/* 바늘. 12시에 고정이고 판이 그 아래로 돈다 */}
          <span
            className="absolute -top-1 left-1/2 z-10 size-4 -translate-x-1/2 bg-foreground"
            style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)" }}
          />
          <div
            ref={discRef}
            className="size-full rounded-full border border-border"
            style={{ backgroundImage: `conic-gradient(${stops})` }}
          />
          {/* 가운데 창. 지금 바늘 아래 있는 칸 이름을 글자로 보여준다 —
              색만으로 알리지 않는다 (CLAUDE.md). */}
          <div className="absolute inset-[26%] flex items-center justify-center rounded-full border border-border bg-background px-1">
            <span
              ref={labelRef}
              className="truncate text-label font-medium"
            >
              {labels[0]}
            </span>
          </div>
        </div>
      )}

      <span className="text-caption text-muted-foreground">고르는 중</span>
    </div>
  );
}

function Result({
  restaurant: r,
  signatureMenu,
  reservationUrl,
  meal,
  repeated,
  onAccept,
}: {
  restaurant: NearbyRestaurant;
  signatureMenu: string | null;
  reservationUrl: string | null;
  meal: MealType;
  /** 직전과 같은 곳이 또 나왔는지 */
  repeated: boolean;
  onAccept: () => void;
}) {
  // 태그를 안 달아도 점심·저녁은 갈린다 — 가격대가 기본 축이다 (pick_restaurant
  // 의 price_fit). 태그가 있으면 그게 앞에 온다. 사람이 적어 둔 게 먼저다.
  const reasons = [
    ...r.moodTags.filter((m) => favoredAt(meal, m)),
    priceReasonAt(meal, r.priceRange),
  ].filter((x): x is string => x !== null);

  // href 로 쓰기 전에 한 번 더 본다. DB 제약이 막고 있지만 그 앞에 들어간 값이
  // 있을 수 있고, `javascript:` 가 통과하면 클릭 한 번에 스크립트가 돈다.
  const bookingUrl =
    reservationUrl && reservationUrlError(reservationUrl) === null
      ? reservationUrl
      : null;
  const price = r.priceRange === null ? null : PRICE_LABEL[r.priceRange];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand-600 p-4">
      <div className="flex flex-col gap-1">
        {/* 매번 전체에서 새로 뽑으니 같은 곳이 또 나올 수 있다. 그 자체는
            정상인데, 아무 말이 없으면 [다시 뽑기] 가 안 먹은 줄로 읽힌다. */}
        {repeated && (
          <p className="text-caption text-muted-foreground">
            같은 곳이 또 나왔어요. 근처 후보가 적으면 그럴 수 있어요
          </p>
        )}
        <span className="text-display">{r.name}</span>
        {/* 대표메뉴 (SPEC §4.2 결과 카드). 없으면 줄 자체를 안 그린다 */}
        {signatureMenu && (
          <span className="text-subtitle text-brand-700">{signatureMenu}</span>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-caption text-muted-foreground">
            {r.category}
          </span>
          <span
            aria-hidden="true"
            className="text-caption text-muted-foreground"
          >
            ·
          </span>
          <Distance meters={r.distanceM} />
          {price && (
            <>
              <span
                aria-hidden="true"
                className="text-caption text-muted-foreground"
              >
                ·
              </span>
              <span className="tnum text-caption text-muted-foreground">
                {price}
              </span>
            </>
          )}
        </div>
        <Rating value={r.avgRating} count={r.reviewCount} />
        {/* **왜 이게 나왔는지 한 줄.** 뽑기는 무작위지만 기울기가 있고, 그걸
            안 보여주면 "왜 이걸 줬지" 로만 남는다. 이 시간대에 **이 집에** 밀어준
            것만 적는다 — 안 밀어준 것까지 적으면 그건 설명이 아니라 나열이다. */}
        {reasons.length > 0 && (
          <p className="text-caption text-muted-foreground">
            {`${meal === "dinner" ? "저녁" : "점심"}이라 `}
            {reasons.join("·")}
            {" 쪽을 더 자주 뽑아요"}
          </p>
        )}
        {r.memo && (
          <p className="text-caption text-muted-foreground">{r.memo}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* 버튼은 실제로 일어나는 일을 쓴다 (CLAUDE.md).
            [다시 뽑기] 는 여기 두지 않는다 — 위의 버튼이 그 역할을 한다.
            같은 이름이 화면에 둘이면 어느 쪽인지 헷갈린다. */}
        <Button onClick={onAccept}>여기로 갈게요</Button>
        {/* 예약 링크가 있으면 여기서 바로 뛴다. 저녁·회식일수록 "가겠다" 다음
            행동이 예약이라, 상세까지 한 번 더 들어가게 하지 않는다.
            링크 없이 예약만 받는 곳은 글자로만 알린다 — 누를 데가 없는 버튼보다 낫다. */}
        {bookingUrl ? (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonClass({ variant: "outline", size: "md" })}
          >
            예약하기
          </a>
        ) : (
          r.reservable && (
            <span className="text-caption text-muted-foreground">
              예약 받는 곳이에요
            </span>
          )
        )}
        <Link
          href={`/restaurants/${r.id}`}
          className={buttonClass({
            variant: "ghost",
            size: "sm",
            className: "ml-auto",
          })}
        >
          자세히 보기
        </Link>
      </div>
    </div>
  );
}

function Empty({
  hasFilters,
  radius,
  onWiden,
  canWiden,
}: {
  hasFilters: boolean;
  radius: number;
  onWiden: () => void;
  canWiden: boolean;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 text-center"
    >
      <p className="text-body">
        {hasFilters
          ? "이 조건에 맞는 곳이 없어요"
          : `반경 ${radius}m 안에 뽑을 곳이 없어요`}
      </p>
      {canWiden ? (
        <Button variant="outline" onClick={onWiden}>
          반경 넓히기
        </Button>
      ) : (
        <Link href="/restaurants/new" className={buttonClass()}>
          맛집 등록하기
        </Link>
      )}
    </div>
  );
}

function PriceChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-chip px-3 py-1.5 text-label ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
