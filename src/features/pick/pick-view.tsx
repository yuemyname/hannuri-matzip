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
import type { Category } from "@/lib/categories";
import { useCategories } from "@/features/categories/api";
import {
  OFFICE,
  RADIUS_OPTIONS,
  radiusLabel,
  readToken,
} from "@/features/map/config";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { useMapView } from "@/features/map/map-store";
import { useNearby } from "@/features/restaurants/use-nearby";
import { PRICE_LABEL, priceReasonAt } from "@/features/restaurants/price";
import type { NearbyRestaurant } from "@/features/restaurants/api";
import {
  answerPick,
  defaultMealType,
  pickRestaurant,
  type MealType,
} from "./api";

/**
 * 연출 길이는 **네트워크와 무관하게 정해져 있다** (2026-08-11 요청).
 *
 * 예전에는 응답이 오는 순간부터 재기 시작해서, 응답이 빠르면(보통 그렇다)
 * 등속으로 도는 구간이 사실상 0이었다 — 누르자마자 감속만 하고 서 버려서
 * "휙 지나갔다" 로 보였다. 이제 **누른 시각**을 기준으로 잡는다:
 *
 *   누름 ─(등속 SPIN_MIN_MS)─ 감속 시작 ─(LANDING_MS)─ 정지 ─(HOLD_MS)─ 결과
 *
 * 응답이 `SPIN_MIN_MS` 보다 늦으면 그때까지 등속으로 더 돈다. 어디 설지 모르는
 * 채로 감속할 수는 없기 때문이다 — 그건 "곧 멈춘다" 는 거짓말이 된다.
 */
const SPIN_MIN_MS = 1000;
/** 감속에 쓰는 시간 */
const LANDING_MS = 2800;
/** 선 자리를 보여주고 서 있는 시간. 이게 없으면 결과 카드가 판을 덮어 버린다 */
const HOLD_MS = 700;
/** 감속하며 최소 몇 바퀴를 더 도는지. 나머지는 설 자리를 맞추는 데 쓴다 */
const LANDING_TURNS = 5;
/** SPEC §3.2 의 p_exclude_days 기본값 */
const EXCLUDE_DAYS = 7;

/**
 * 이름을 놓는 자리 — 반지름의 몇 할인가. 테두리와 가운데 사이다.
 * 바깥으로 갈수록 칸이 벌어져 글자가 더 들어가지만, 너무 나가면 테두리에 닿는다.
 */
const R_LABEL = 0.68;

/**
 * 종류를 하나만 골랐을 때 판에 올릴 가게 수의 상한. 가까운 순 앞에서 자른다.
 * 서른 곳을 다 칸으로 만들면 이름이 안 읽힌다.
 */
const WHEEL_NAME_MAX = 10;

/**
 * 칸이 몇 개일 때 같은 이름을 몇 번씩 놓을지 (2026-08-12 요청).
 *
 *   2 → 4번씩 8칸 / 3 → 3번씩 9칸 / 4 → 2번씩 8칸 / 5 → 2번씩 10칸
 *   6 이상 → 그대로. 이미 판으로 보이고, 더 늘리면 이름이 안 읽힌다.
 *   1 이하 → 그대로. 한 칸을 여덟으로 늘려 봐야 같은 이름 여덟 개다.
 */
const WHEEL_MIN_SLICES = 8;
function sliceReps(n: number): number {
  if (n < 2 || n >= 6) return 1;
  return Math.ceil(WHEEL_MIN_SLICES / n);
}

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
  /**
   * 최근 간 곳 빼기 — **기본은 꺼짐** (2026-08-11 요청).
   *
   * 켜 두면 후보가 조용히 줄어든다. 등록된 곳이 몇십 곳뿐인 지금은 그게
   * "왜 안 나오지" 로만 남는다. 필요한 사람이 켜는 쪽이 맞다.
   */
  const [excludeRecent, setExcludeRecent] = useState(false);

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

  /**
   * 연출이 끝났는가. **누르는 순간 곧바로 false 가 된다.**
   *
   * 예전에는 응답을 받은 뒤 이펙트에서 켰다. 그 사이에 `isPending` 은 이미
   * false 인데 연출 플래그는 아직 false 인 **한 렌더**가 생겨서, 룰렛이 통째로
   * 사라졌다 다시 붙었다 — 새로 붙은 판은 인라인 스타일이 없으니 등속 회전이
   * 꺼진 채로 시작했다. 그래서 응답이 빠를 때(=대부분) 판이 1초간 **가만히
   * 서 있다가** 갑자기 감속만 하고 멎었다. "안 돌아간다 / 뚝 끊긴다" 가 이것이다.
   *
   * 상태를 렌더 중에 세우면 그 틈이 아예 없다.
   */
  const [revealed, setRevealed] = useState(true);
  const shuffling = !revealed;

  // 연출이 끝나는 시각을 예약한다. 남은 시간은 **누른 시각**에서 잰다 —
  // 응답이 빨랐으면 등속 구간이 아직 남아 있고, 늦었으면 이미 지나갔다.
  useEffect(() => {
    if (!pick.isSuccess) return;
    // 뽑을 게 없었으면 연출할 것도 없다. 멈출 칸이 없는데 돌면 아무 칸에나 선다.
    if (result === null) {
      setRevealed(true);
      return;
    }
    const wait = reduceMotion
      ? 0
      : Math.max(0, pick.submittedAt + SPIN_MIN_MS - Date.now());
    const total = reduceMotion ? HOLD_MS : wait + LANDING_MS + HOLD_MS;
    const t = setTimeout(() => setRevealed(true), total);
    return () => clearTimeout(t);
  }, [pick.isSuccess, pick.submittedAt, result, reduceMotion]);

  // 못 뽑았으면 연출을 붙잡고 있을 이유가 없다
  useEffect(() => {
    if (pick.isError) setRevealed(true);
  }, [pick.isError]);

  /**
   * 종류를 **하나만** 골랐으면 판에 종류 대신 **가게 이름**을 올린다
   * (2026-08-12 요청). 「한식」 한 칸짜리 판은 뽑는 그림이 안 된다 — 그 조건에서
   * 실제로 갈리는 것은 종류가 아니라 가게다.
   *
   * 그래서 그때만 반경 안의 가게를 따로 받아 온다. 안 고르거나 둘 이상 골랐을
   * 때는 받지 않는다 (`anchor` 가 null 이면 질의 자체가 안 나간다).
   */
  const soloCategory = categories.length === 1 ? categories[0] : null;
  const soloNearby = useNearby(soloCategory ? center : null, radius, {
    categories: soloCategory ? [soloCategory] : undefined,
  });

  /**
   * 판에 올릴 가게 이름. **가까운 순으로 앞에서 몇 곳만** 쓴다.
   *
   * 서른 곳을 다 칸으로 만들면 이름이 안 읽힌다. 판은 후보 명단이 아니라
   * "지금 이 중에서 고르는 중" 을 보여주는 그림이라, 몇 곳만 보여도 뜻이 산다.
   * 뽑힌 곳이 이 안에 없으면 아래에서 칸을 하나 덧붙인다.
   *
   * 가격대는 여기서 한 번 더 거른다 — 서버가 거르는 조건이라, 안 거르면 판에
   * 나올 수 없는 가게가 돈다. 「최근 간 곳 빼기」는 남의 방문 기록이라 여기서
   * 알 수 없다. 그 경우는 덧붙이기가 받아 준다.
   */
  const soloNames = useMemo(() => {
    if (!soloCategory) return null;
    const rows = (soloNearby.data ?? []).filter(
      (r) =>
        maxPrice === null || r.priceRange === null || r.priceRange <= maxPrice,
    );
    // 아직 못 받았으면 종류 이름이라도 남긴다. 빈 판보다는 낫다.
    if (rows.length === 0) return [soloCategory];
    return rows.slice(0, WHEEL_NAME_MAX).map((r) => r.name);
  }, [soloCategory, soloNearby.data, maxPrice]);

  /**
   * 판에 그릴 것 = **지금 나올 수 있는 것**이다 (2026-08-12 정정).
   *
   * 전에는 조건과 상관없이 늘 전체 종류를 그렸다. 「한식」만 골라 놓아도 판에는
   * 일곱 칸이 그대로 돌아서, 나올 수 없는 종류가 나올 것처럼 보였다 — 판이
   * 조건을 배신한 것이다. 아무것도 안 고르면 전체가 후보이므로 그대로 전체다.
   *
   * 고른 순서가 아니라 **목록 순서**로 세운다. 칩을 누른 차례대로 칸을 만들면
   * 같은 조건인데 순서만 다른 판이 나온다.
   *
   * 뽑힌 것은 무슨 일이 있어도 들어 있어야 한다 — 멈출 칸이 없으면 엉뚱한
   * 칸에 선다 (목록이 낡았거나, 조건을 바꾸는 사이에 답이 온 경우).
   */
  const wheelBase = useMemo(() => {
    const all = categoryList.data ?? [];
    const base =
      soloNames ??
      (categories.length > 0 ? all.filter((c) => categories.includes(c)) : all);
    const target =
      result === null ? null : soloCategory ? result.name : result.category;
    if (target === null || base.includes(target)) return base;
    return [...base, target];
  }, [categoryList.data, categories, soloCategory, soloNames, result]);

  /**
   * 칸이 적으면 판이 아니라 파이 차트로 보인다 (2026-08-12 요청). 둘이면 반반,
   * 셋이면 세 조각 — 그건 돌려서 뽑는 그림이 아니다. 그래서 **같은 이름을 돌려
   * 채워** 여덟 칸쯤 만든다. 한 바퀴를 통째로 반복하므로 칸이 번갈아 놓인다
   * (A·B·A·B…). 붙여 놓으면(A·A·B·B) 반반짜리 판과 다를 바 없다.
   *
   * 여섯 이상이면 그대로 둔다 — 이미 판으로 보이고, 더 늘리면 이름이 안 읽힌다.
   * 어느 칸에 서든 이름이 같으니 **결과는 그대로다.** 늘어난 건 그림뿐이다.
   */
  const wheelLabels = useMemo(() => {
    const reps = sliceReps(wheelBase.length);
    if (reps === 1) return wheelBase;
    return Array.from({ length: reps }, () => wheelBase).flat();
  }, [wheelBase]);

  /**
   * 멈출 칸. 같은 이름이 여럿이면 그중 하나를 고르는데, **누른 시각으로** 고른다 —
   * `Math.random()` 을 쓰면 리렌더마다 자리가 바뀌고, 그건 도는 도중에 목표가
   * 움직인다는 뜻이다. 어느 쪽을 골라도 이름이 같으니 결과와는 무관하다.
   */
  const targetIndex = useMemo(() => {
    if (!pick.isSuccess || result === null) return null;
    const label = soloCategory ? result.name : result.category;
    const i = wheelBase.indexOf(label);
    if (i < 0) return null;
    const reps = wheelBase.length === 0 ? 1 : wheelLabels.length / wheelBase.length;
    return i + (pick.submittedAt % reps) * wheelBase.length;
  }, [
    pick.isSuccess,
    pick.submittedAt,
    result,
    soloCategory,
    wheelBase,
    wheelLabels,
  ]);
  const showResult = pick.isSuccess && !shuffling;
  // 뽑힌 곳이 화면에 있는지. 있으면 위 버튼이 [다시 뽑기] 가 된다.
  // 후보가 0건이었을 때는 되뽑을 대상이 없으므로 [뽑아줘] 그대로다.
  const hasResult = showResult && result !== null;

  /**
   * 조건 카드는 **접힌 채로 시작한다** (2026-08-11 요청).
   *
   * 다섯 칸을 늘 펴 두면 [뽑아줘] 와 결과가 화면 아래로 밀려서, 뽑을 때마다
   * 스크롤을 내려야 했다. 이 화면에서 제일 자주 하는 일은 조건을 고치는 게
   * 아니라 **그냥 뽑는 것**이라, 조건은 접어 두고 지금 값만 한 줄로 적는다.
   */
  const [openConditions, setOpenConditions] = useState(false);

  /** 접힌 줄에 적는 지금 조건. 안 적으면 무엇으로 뽑는지 모른 채 누르게 된다 */
  const summary = [
    meal === "lunch" ? "점심" : "저녁",
    radiusLabel(radius),
    categories.length === 0
      ? "종류 전체"
      : categories.length === 1
        ? categories[0]
        : `${categories[0]} 외 ${categories.length - 1}`,
    maxPrice === null ? "가격 상관없음" : `${PRICE_LABEL[maxPrice]}까지`,
    excludeRecent ? `최근 ${EXCLUDE_DAYS}일 뺌` : "최근 간 곳 포함",
  ].join(" · ");

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

  /** 뽑기 시작. **연출 시작을 렌더 중에 세운다** (위 revealed 주석 참고) */
  const draw = () => {
    setRevealed(false);
    pick.mutate();
  };

  const again = async () => {
    if (logId) await answerPick(logId, false);
    draw();
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

      <Conditions
        open={openConditions}
        onToggle={() => setOpenConditions((v) => !v)}
        summary={summary}
      >
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
            // **줄바꿈을 허용한다** (2026-08-12). 반경이 여섯 칸이 되면서 360px
            // 에서 「1km」가 화면 밖으로 밀렸다. 가로 스크롤로 두면 마지막 칸이
            // 있는 줄 모르고 지나간다 — 넓히려고 늘린 선택지가 안 보이면 헛일이다.
            className="flex flex-wrap gap-1 self-start rounded-chip border border-border p-1"
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
                {radiusLabel(m)}
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
      </Conditions>

      <div className="flex items-center gap-2">
        {/* 결과가 떠 있어도 이 버튼은 계속 보인다. 자리를 옮기지 않고 이름만
            바뀐다 — 조건을 고치고 바로 다시 뽑는 게 이 화면의 주 동작이라,
            버튼이 사라졌다 나타나면 매번 눈으로 다시 찾아야 한다.
            **[다시 뽑기] 는 여기 하나뿐이다.** 결과 카드 안에도 두면 같은 이름의
            버튼이 둘이 되어 어느 쪽인지 헷갈린다. */}
        <Button
          onClick={() => (hasResult ? void again() : draw())}
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
            // **이번 응답이 온 뒤에만** 칸이 정해진다 (`targetIndex` 안에서
            // `pick.isSuccess` 를 본다). 다시 뽑는 동안에는 `result` 에 직전
            // 결과가 남아 있어서, 그걸 그냥 보면 누르자마자 선다.
            targetIndex={targetIndex}
            spinStartedAt={pick.submittedAt}
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
 * 조회 조건을 담는 접었다 펴는 카드 (2026-08-11 요청).
 *
 * 접혀 있을 때도 **지금 조건을 한 줄로 적는다.** 안 적으면 무엇으로 뽑는지
 * 모른 채 [뽑아줘] 를 누르게 되고, 결과가 이상할 때 어디를 봐야 하는지도 모른다.
 *
 * 접히면 안쪽을 **DOM 에서 뺀다.** 남겨 두면 Tab 이 안 보이는 칩 스무 개를
 * 지나간다. 그래서 `aria-controls` 도 펴져 있을 때만 가리킨다 —
 * 없는 id 를 가리키는 것보다 아예 안 가리키는 쪽이 맞다.
 */
function Conditions({
  open,
  onToggle,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? "pick-conditions" : undefined}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="shrink-0 text-label font-medium">조건</span>
        <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
          {summary}
        </span>
        {/* 상태를 기호로만 알리지 않는다. 무엇이 일어날지 글자로 쓴다 (CLAUDE.md) */}
        <span className="shrink-0 text-caption font-medium text-brand-700">
          {open ? "접기" : "펴기"}
        </span>
      </button>

      {open && (
        <div
          id="pick-conditions"
          className="flex flex-col gap-5 border-t border-border px-4 py-4"
        >
          {children}
        </div>
      )}
    </section>
  );
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
 *   응답이 빨리 와도 **누른 지 `SPIN_MIN_MS` 가 지나야** 감속을 시작한다 —
 *   연출 길이를 네트워크가 정하면 누를 때마다 다른 화면이 된다.
 * - 숫자가 들어오면 — 응답이 왔고 답도 정해졌다. 그 칸에 오도록 몇 바퀴 더 돌며
 *   감속한다. **판이 답을 정하는 게 아니라 답이 판을 세운다** (CLAUDE.md:
 *   추천 결과는 서버가 결정한다).
 *
 * 판은 **캔버스로 그린다** (2026-08-11 재작업). 처음엔 `conic-gradient` + 가운데
 * 창이었는데, 색 조각만 돌고 이름이 한 개만 보여서 룰렛처럼 안 보였다. 칸마다
 * 이름을 부챗살 방향으로 박으면 그제야 "돌아가는 판" 이 된다 — 그건 CSS 로는
 * 못 하고 캔버스가 필요하다.
 *
 * **판은 한 번 그리고, 회전은 CSS 가 한다** (2026-08-11 재작업 — 사용자가 준
 * 캔버스 예제와 같은 방식이다).
 *
 * 그전에는 자바스크립트가 매 프레임 각도를 옮겼다(rAF). 실기기에서 뚝뚝 끊겼는데,
 * 원인은 그리는 비용이 아니라 **메인 스레드에 얹었다는 것 자체**다 — 이 화면
 * 뒤에는 지도가 살아 있고 조회도 돈다. CSS 키프레임·트랜지션은 합성 스레드가
 * 돌리므로 메인이 바쁘든 말든 안 끊긴다. 도는 동안 자바스크립트는 한 줄도 안 돈다.
 *
 * 색·글꼴은 **토큰에서 읽어 온다** (`readToken`). 캔버스는 CSS 를 모르니 값을
 * 넘겨야 하는데, 여기에 hex 나 px 를 적으면 토큰 정본이 두 군데가 된다.
 *
 * 판은 `aria-hidden` 이다. 답은 바깥 `aria-live` 가 결과 카드로 읽어 준다.
 * 색만으로 알리지 않는다는 규칙은 **칸에 박힌 이름 글자**가 지킨다.
 */
function Roulette({
  labels,
  targetIndex,
  spinStartedAt,
  reduce,
}: {
  /** 칸에 박을 글자. 종류 이름이거나 가게 이름이다 */
  labels: readonly string[];
  /** 멈출 칸. null 이면 아직 응답 전이라 계속 돈다 */
  targetIndex: number | null;
  /** [뽑아줘] 를 누른 시각(`Date.now()`). 등속 구간을 여기서부터 잰다 */
  spinStartedAt: number;
  /** 움직임을 줄여 달라고 한 사람에게는 안 돌린다 */
  reduce: boolean;
}) {
  const discRef = useRef<HTMLCanvasElement>(null);
  /** 판을 그려 넣는다. 색·글꼴을 한 번 읽어 둔 뒤 채워진다 */
  const drawRef = useRef<() => void>(() => {});

  const n = labels.length;

  /** 칸 i 가 바늘(12시)에 오는 회전량 */
  const restAngle = (i: number) =>
    ((((360 - (i + 0.5) * (360 / n)) % 360) + 360) % 360);

  /**
   * 회전은 **CSS 가 한다** (2026-08-11 재작업, 사용자가 준 예제와 같은 방식).
   *
   * 그전에는 rAF 로 매 프레임 각도를 옮겼는데 실기기에서 뚝뚝 끊겼다. 원인은
   * 그리는 비용이 아니라 **메인 스레드에 얹었다는 것 자체**다 — 이 화면 뒤에는
   * 지도가 살아 있고 조회도 돈다. CSS 키프레임과 트랜지션은 합성 스레드가
   * 돌리므로 메인이 바쁘든 말든 안 끊긴다. 도는 동안 자바스크립트는 **한 줄도
   * 안 돈다.**
   *
   *   답 대기 → `--animate-pick-spin` (등속 무한)
   *   답 도착 → 지금 각도를 고정 → 리플로우 → 목표 각도로 한 번 트랜지션
   *
   * 가운데의 "지금 각도를 고정" 이 없으면 안 된다. 애니메이션이 그리는 값은
   * 트랜지션의 시작점이 아니라서, 바로 목표를 걸면 0도에서 다시 출발한다.
   */
  const spinFree = () => {
    const cv = discRef.current;
    if (!cv) return;
    cv.style.transition = "none";
    cv.style.transform = "";
    cv.style.animation = "var(--animate-pick-spin)";
  };

  const landOn = (i: number) => {
    const cv = discRef.current;
    if (!cv) return;
    // 지금 화면에 보이는 각도. 애니메이션 도중이면 그 순간 값이다.
    const m = new DOMMatrixReadOnly(getComputedStyle(cv).transform);
    const from = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    const want = restAngle(i);
    // **앞으로만 돈다.** 뒤로 감기면 룰렛이 아니라 되감기로 보인다.
    let to = Math.ceil(from / 360) * 360 + LANDING_TURNS * 360 + want;
    while (to <= from) to += 360;

    cv.style.animation = "none";
    cv.style.transition = "none";
    cv.style.transform = `rotate(${from}deg)`;
    // 리플로우. 이게 없으면 브라우저가 위 두 줄과 아래를 한 번에 묶어 버려서
    // 트랜지션이 아예 안 걸린다.
    void cv.offsetWidth;
    cv.style.transition = `transform ${LANDING_MS}ms var(--ease-roulette)`;
    cv.style.transform = `rotate(${to}deg)`;
  };

  useEffect(() => {
    const cv = discRef.current;
    if (!cv || n === 0) return;

    if (targetIndex === null) {
      if (!reduce) spinFree();
      return;
    }

    // 움직임을 줄여 달라고 했으면 **돌리지 않고 답 위에 세운다.**
    if (reduce) {
      cv.style.animation = "none";
      cv.style.transition = "none";
      cv.style.transform = `rotate(${restAngle(targetIndex)}deg)`;
      return;
    }

    // **누른 시각 기준으로** 등속 구간이 얼마나 남았는지 잰다. 응답이 빨라도
    // 그만큼은 돌고 나서 감속한다 — 안 그러면 누르자마자 서 버린다.
    const wait = Math.max(0, spinStartedAt + SPIN_MIN_MS - Date.now());
    const t = setTimeout(() => landOn(targetIndex), wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIndex, n, spinStartedAt, reduce]);

  /**
   * 판을 그린다. **딱 한 번**이다 — 회전은 CSS 가 요소째로 돌리므로 그림은
   * 안 바뀐다. 숨은 캔버스에 그린 뒤 한 번 옮겨 붙인다.
   */
  useEffect(() => {
    const cv = discRef.current;
    if (!cv || n < 2) return;
    const g = cv.getContext("2d");
    if (!g) return;

    // 레티나에서 글자가 뭉개지지 않게 실제 픽셀로 키워 그린다.
    const size = cv.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);

    const off = document.createElement("canvas");
    off.width = cv.width;
    off.height = cv.height;
    const o = off.getContext("2d");
    if (!o) return;
    o.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = size / 2;
    const arc = (2 * Math.PI) / n;
    const rim = readToken("--border");
    const hub = readToken("--background");

    /**
     * 칸은 **브랜드색과 흰색을 번갈아** 칠한다 (2026-08-11 요청).
     *
     * 종류마다 다른 색을 주던 것을 접었다. 일곱 색을 한 판에 모으면 쨍하든
     * 옅든 정신없고, 어차피 무슨 칸인지는 **박아 넣은 이름**이 말한다.
     * 두 색만 쓰면 판이 조용해지고 앱의 다른 화면과도 같은 옷이 된다.
     */
    const brand = readToken("--primary");
    const plain = readToken("--background");
    const onBrand = readToken("--primary-foreground");
    const ink = readToken("--foreground");
    const isBrand = (i: number) => i % 2 === 0;
    const fillOf = (i: number) => (isBrand(i) ? brand : plain);

    for (let i = 0; i < n; i++) {
      const fill = fillOf(i);
      if (!fill) continue;
      o.beginPath();
      o.fillStyle = fill;
      o.moveTo(c, c);
      // 12시에서 시작해 시계방향. 바늘이 12시라 칸 번호와 각도가 그대로 맞는다.
      o.arc(c, c, c - 1, arc * i - Math.PI / 2, arc * (i + 1) - Math.PI / 2);
      o.fill();
    }

    // **같은 색끼리 붙는 자리에만 금을 긋는다.** 칸이 홀수면 한 바퀴 돌아
    // 만나는 곳에서 브랜드색 둘이 맞붙어 한 칸처럼 보인다 (지금 종류는 일곱이다).
    // 색이 다른 경계는 그 자체가 금이라 그을 이유가 없다.
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      if (fillOf(i) !== fillOf(next)) continue;
      const line = isBrand(i) ? onBrand : rim;
      if (!line) continue;
      const a = arc * next - Math.PI / 2;
      o.beginPath();
      o.strokeStyle = line;
      o.lineWidth = 1;
      o.moveTo(c, c);
      o.lineTo(c + Math.cos(a) * (c - 1), c + Math.sin(a) * (c - 1));
      o.stroke();
    }

    // 칸 이름을 부챗살 방향으로 박는다. 없으면 색 조각만 도는 것으로 보인다.
    const rootPx = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const rem = parseFloat(readToken("--text-label") ?? "");
    const family = readToken("--font-sans") ?? "";
    // 칸이 많아질수록 글자를 줄인다. 안 줄이면 이웃 칸 글자와 겹친다.
    const px = rem * rootPx * (n > 9 ? 0.86 : 1);
    if (Number.isFinite(px) && ink && onBrand) {
      o.font = `600 ${px}px ${family}`;
      o.textAlign = "center";
      o.textBaseline = "middle";
      /**
       * 칸에 안 들어가는 이름은 **줄여서 …** 를 붙인다 (2026-08-12).
       *
       * `fillText` 의 maxWidth 는 넘치면 글자를 가로로 눌러 버린다. 종류 이름은
       * 두세 자라 걸릴 일이 없었는데, 가게 이름을 올리기 시작하면서 「한누리
       * 해장국 본점」 같은 것이 납작하게 찌그러진다. 잘린 것은 잘린 것으로
       * 보이는 편이 낫다.
       */
      /**
       * 이름은 **칸을 가로지르는 방향**으로 놓인다. 그래서 쓸 수 있는 폭은
       * 반지름이 아니라 **그 자리에서 칸이 벌어진 폭**이다 — 부채꼴의 두 변은
       * 가운데에서 뻗어 나가므로, 반지름 r 자리의 반폭은 `r·tan(칸각/2)` 다.
       *
       * 예전엔 이걸 안 보고 `c*0.72` 를 그대로 썼다. 종류 이름은 두세 자라
       * 안 걸렸는데, 가게 이름을 올리자마자 옆 칸을 파고들었다.
       */
      const maxW = Math.min(c * 0.72, 2 * R_LABEL * c * Math.tan(arc / 2) * 0.92);
      const fit = (s: string) => {
        if (o.measureText(s).width <= maxW) return s;
        let cut = s;
        while (cut.length > 1 && o.measureText(`${cut}…`).width > maxW) {
          cut = cut.slice(0, -1);
        }
        return `${cut}…`;
      };
      for (let i = 0; i < n; i++) {
        // 칸에 따라 글자색이 뒤집힌다. 브랜드색 위에는 흰 글자가 5.1:1 이다.
        o.fillStyle = isBrand(i) ? onBrand : ink;
        const a = arc * i + arc / 2 - Math.PI / 2;
        const r = c * R_LABEL;
        // **위아래를 따로 뒤집지 않는다.** 판이 통째로 도는 그림이라 판
        // 좌표에서 내린 판단은 돌아간 뒤엔 틀린다. 이대로 두면 착지 회전량이
        // 정확히 이 각도를 상쇄해서 **바늘에 선 칸은 언제나 똑바로 선다.**
        // 나머지가 기울어 보이는 건 진짜 룰렛판과 같은 모습이다.
        o.save();
        o.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
        o.rotate(a + Math.PI / 2);
        o.fillText(fit(labels[i]), 0, 0);
        o.restore();
      }
    }

    if (rim) {
      o.strokeStyle = rim;
      o.lineWidth = 1;
      o.beginPath();
      o.arc(c, c, c - 1, 0, Math.PI * 2);
      o.stroke();
    }
    // 가운데 축. 있어야 "돌아가는 판" 으로 읽힌다 (원이라 돌아도 그대로다)
    if (hub) {
      o.fillStyle = hub;
      o.beginPath();
      o.arc(c, c, size * 0.055, 0, Math.PI * 2);
      o.fill();
      if (rim) o.stroke();
    }

    drawRef.current = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(off, 0, 0);
    };

    drawRef.current();
  }, [labels, n]);

  /**
   * 칸이 하나면 판이 될 수 없다 — 돌 이유가 없고, 돌면 오히려 고장으로 보인다.
   * 후보가 한 곳뿐일 때가 그렇다 (종류를 하나 골랐는데 반경 안에 그 종류가
   * 한 곳뿐인 경우). 그때는 판 대신 **그 이름**을 크게 남긴다. 판만 지우면
   * 테두리 안에 「고르는 중」 넉 자만 남아 무엇을 고르는 중인지가 사라진다.
   */
  const drawable = n >= 2;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-6">
      {!drawable && n === 1 && (
        <span className="py-8 text-title font-medium">{labels[0]}</span>
      )}
      {drawable && (
        <div aria-hidden="true" className="relative size-64 max-w-full">
          {/* 바늘. 12시에 고정이고 판이 그 아래로 돈다 */}
          <span
            className="absolute -top-1 left-1/2 z-10 size-5 -translate-x-1/2 bg-foreground"
            style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)" }}
          />
          {/* `rounded-full` 을 안 건다. 판은 이미 원으로 그려져 있어서 마스크가
              하는 일이 없는데, 도는 내내 합성 비용만 낸다. */}
          <canvas ref={discRef} className="size-full origin-center" />
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
          : `반경 ${radiusLabel(radius)} 안에 뽑을 곳이 없어요`}
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
