"use client";

import { useEffect, useRef, useState } from "react";
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
import { RADIUS_OPTIONS } from "@/features/map/config";
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

// globals.css 의 `--animate-pick-fill` 도 1.2s 다. 한쪽만 고치면 바가 다 차고도
// 결과가 안 뜨거나, 덜 찬 채로 결과가 뜬다.
const SHUFFLE_MS = 1200;
const TICK_MS = 90;
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

  // 세션 안에서 이미 뽑힌 것들. 서버가 이걸 받아 같은 곳을 피한다 (WBS 4.4 DoD).
  const [seen, setSeen] = useState<string[]>([]);
  const [result, setResult] = useState<NearbyRestaurant | null>(null);
  const [signatureMenu, setSignatureMenu] = useState<string | null>(null);
  const [reservationUrl, setReservationUrl] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [emptyPool, setEmptyPool] = useState(false);

  /**
   * **뺄 목록을 인자로 받는다.** 예전에는 `seen` 을 클로저로 읽었는데, 그러면
   * "처음부터 다시" 처럼 목록을 비우고 곧바로 뽑는 길을 만들 수 없다 —
   * `setSeen([])` 은 다음 렌더에나 반영되고, 그 사이에 나가는 요청은 여전히
   * 예전 목록을 들고 간다.
   */
  const pick = useMutation({
    mutationFn: (excludeIds: readonly string[]) =>
      pickRestaurant({
        lat: center.lat,
        lng: center.lng,
        radiusM: radius,
        mealType: meal,
        categories,
        maxPrice,
        excludeDays: excludeRecent ? EXCLUDE_DAYS : 0,
        excludeIds,
      }),
    onSuccess: (r, excludeIds) => {
      setEmptyPool(r.restaurant === null);
      setResult(r.restaurant);
      setSignatureMenu(r.signatureMenu);
      setReservationUrl(r.reservationUrl);
      setLogId(r.logId);
      // 방금 요청에 실제로 쓴 목록 위에 쌓는다. 클로저의 `seen` 을 쓰면
      // "처음부터 다시" 로 비운 것이 되살아난다.
      setSeen(r.restaurant ? [...excludeIds, r.restaurant.id] : [...excludeIds]);
    },
  });

  // **결과는 응답으로 이미 정해져 있다.** 셔플은 그 뒤에 도는 연출이다 (SPEC §3.2).
  const shuffling = useShuffle(pick.isSuccess ? pick.submittedAt : null);
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
    pick.mutate(seen);
  };

  /**
   * 근처를 다 봤을 때 빠져나가는 길.
   *
   * 사내 맛집은 한 동네에 몇 곳뿐이라 **두세 번이면 후보가 바닥난다.** 그때
   * 예전에는 "반경 200m 안에 뽑을 곳이 없어요" 가 떴는데, 그건 거짓말이다 —
   * 곳은 있고 방금 다 본 것뿐이다. 반경을 넓히거나 맛집을 등록하라고 안내해
   * 봐야 원인이 아니라 엉뚱한 데를 고치게 된다.
   */
  const restart = () => {
    setSeen([]);
    pick.mutate([]);
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
            : "위치를 못 얻어서 사무실을 기준으로 찾아요"}
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
          onClick={() => (hasResult ? void again() : pick.mutate(seen))}
          disabled={pick.isPending || shuffling}
        >
          {pick.isPending || shuffling
            ? "고르는 중"
            : hasResult
              ? "다시 뽑기"
              : "뽑아줘"}
        </Button>
        {seen.length > 0 && (
          <span className="tnum text-caption text-muted-foreground">
            {seen.length}번 뽑음
          </span>
        )}
      </div>

      <div aria-live="polite" className="min-h-0">
        {/* 응답이 도착한 뒤(=shuffling)에만 남은 시간을 안다 */}
        {(pick.isPending || shuffling) && (
          <Shuffling
            determinate={!pick.isPending && shuffling}
            labels={categoryList.data ?? []}
          />
        )}

        {showResult && result && (
          <Result
            restaurant={result}
            signatureMenu={signatureMenu}
            reservationUrl={reservationUrl}
            meal={meal}
            onAccept={() => void accept()}
          />
        )}

        {showResult && emptyPool && (
          <Empty
            // 뽑아 본 게 있으면서 비었다면, 없는 게 아니라 다 본 것이다.
            exhausted={seen.length}
            hasFilters={categories.length > 0 || maxPrice !== null}
            radius={radius}
            onRestart={restart}
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
function useShuffle(startedAt: number | null) {
  const [running, setRunning] = useState(false);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt === null || startedAt === last.current) return;
    last.current = startedAt;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRunning(false);
      return;
    }

    setRunning(true);
    const t = setTimeout(() => setRunning(false), SHUFFLE_MS);
    return () => clearTimeout(t);
  }, [startedAt]);

  return running;
}

/**
 * 고르는 중 연출 + 진행 바.
 *
 * 바는 두 가지 상태를 구분해서 그린다. 이게 핵심이다:
 * - `determinate` — 응답을 이미 받았고 셔플만 도는 중이다. 남은 시간이
 *   정확히 `SHUFFLE_MS` 라서 그 시간에 맞춰 채운다.
 * - 아니면 — 아직 응답을 기다린다. 얼마나 걸릴지 모르므로 퍼센트를 지어내지 않고
 *   왕복만 시킨다. 여기서 1.2초짜리 채움을 쓰면 느린 네트워크에서 바가 다 차고도
 *   결과가 안 나오는, 대놓고 거짓말하는 화면이 된다.
 *
 * 바는 `aria-hidden` 이다. 진행률 자체는 1.2초짜리라 읽어 줄 값이 아니고,
 * 상태는 옆의 "고르는 중" 글자와 바깥의 `aria-live` 가 이미 알린다.
 * 색만으로 알리지 않는다는 규칙(CLAUDE.md)도 그 글자가 지킨다.
 */
function Shuffling({
  determinate,
  labels,
}: {
  determinate: boolean;
  labels: readonly string[];
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => v + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);
  // 목록을 아직 못 받았을 수 있다. 그때도 뭔가는 넘겨야 화면이 안 빈다.
  const label = labels.length > 0 ? labels[i % labels.length] : "고르는 중";

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-6">
      <span aria-hidden="true" className="text-display">
        {label}
      </span>

      <span
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-chip bg-muted"
      >
        <span
          className={
            determinate
              ? "block h-full w-full origin-left rounded-chip bg-primary animate-pick-fill"
              : "block h-full w-1/4 rounded-chip bg-primary animate-pick-slide"
          }
        />
      </span>

      <span className="text-caption text-muted-foreground">고르는 중</span>
    </div>
  );
}

function Result({
  restaurant: r,
  signatureMenu,
  reservationUrl,
  meal,
  onAccept,
}: {
  restaurant: NearbyRestaurant;
  signatureMenu: string | null;
  reservationUrl: string | null;
  meal: MealType;
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
  exhausted,
  onRestart,
}: {
  hasFilters: boolean;
  radius: number;
  onWiden: () => void;
  canWiden: boolean;
  /** 이번 세션에서 뽑아 본 곳 수. 0보다 크면 "없는" 게 아니라 "다 본" 것이다 */
  exhausted: number;
  onRestart: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 text-center"
    >
      <p className="text-body">
        {exhausted > 0
          ? `근처에서 뽑을 수 있는 ${exhausted}곳을 다 봤어요`
          : hasFilters
            ? "이 조건에 맞는 곳이 없어요"
            : `반경 ${radius}m 안에 뽑을 곳이 없어요`}
      </p>

      {exhausted > 0 && (
        // 다 봤을 때 제일 하고 싶은 건 "그래도 하나 골라줘" 다. 그걸 먼저 둔다.
        <Button onClick={onRestart}>처음부터 다시 뽑기</Button>
      )}

      {canWiden ? (
        <Button variant="outline" onClick={onWiden}>
          반경 넓히기
        </Button>
      ) : (
        <Link
          href="/restaurants/new"
          className={buttonClass({ variant: exhausted > 0 ? "outline" : "primary" })}
        >
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
