"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Button, buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CategoryChip } from "@/components/category-chip";
import { Rating } from "@/components/rating";
import { Distance } from "@/components/distance";
import { CATEGORIES, type Category } from "@/lib/categories";
import { RADIUS_OPTIONS } from "@/features/map/config";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { useMapView } from "@/features/map/map-store";
import { PRICE_LABEL } from "@/features/restaurants/sort";
import type { NearbyRestaurant } from "@/features/restaurants/api";
import {
  answerPick,
  defaultMealType,
  pickRestaurant,
  type MealType,
} from "./api";

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
  const { center } = useCurrentPosition();
  const radiusFromMap = useMapView((s) => s.radius);
  const setSelectedId = useMapView((s) => s.setSelectedId);

  // 시간대 기반 기본값 (SPEC §4.2). 서버 렌더와 어긋나지 않게 마운트 후에 정한다.
  const [meal, setMeal] = useState<MealType>("lunch");
  useEffect(() => setMeal(defaultMealType(new Date())), []);

  const [radius, setRadius] = useState(radiusFromMap);
  const [categories, setCategories] = useState<Category[]>([]);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [excludeRecent, setExcludeRecent] = useState(true);

  // 세션 안에서 이미 뽑힌 것들. 서버가 이걸 받아 같은 곳을 피한다 (WBS 4.4 DoD).
  const [seen, setSeen] = useState<string[]>([]);
  const [result, setResult] = useState<NearbyRestaurant | null>(null);
  const [signatureMenu, setSignatureMenu] = useState<string | null>(null);
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
        excludeIds: seen,
      }),
    onSuccess: (r) => {
      setEmptyPool(r.restaurant === null);
      setResult(r.restaurant);
      setSignatureMenu(r.signatureMenu);
      setLogId(r.logId);
      if (r.restaurant) setSeen((prev) => [...prev, r.restaurant!.id]);
    },
  });

  // **결과는 응답으로 이미 정해져 있다.** 셔플은 그 뒤에 도는 연출이다 (SPEC §3.2).
  const shuffling = useShuffle(pick.isSuccess ? pick.submittedAt : null);
  const showResult = pick.isSuccess && !shuffling;

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
          {CATEGORIES.map((c) => (
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
        {/* 결과 카드가 떠 있으면 여기 버튼은 감춘다. 카드 안에 [다시 뽑기] 가
            이미 있어서, 같은 이름의 버튼이 화면에 둘이 되면 어느 쪽인지 헷갈린다. */}
        {!(showResult && result) && (
          <Button
            onClick={() => pick.mutate()}
            disabled={pick.isPending || shuffling}
          >
            {pick.isPending || shuffling ? "고르는 중" : "뽑아줘"}
          </Button>
        )}
        {seen.length > 0 && (
          <span className="tnum text-caption text-muted-foreground">
            {seen.length}번 뽑음
          </span>
        )}
      </div>

      <div aria-live="polite" className="min-h-0">
        {(pick.isPending || shuffling) && <Shuffling />}

        {showResult && result && (
          <Result
            restaurant={result}
            signatureMenu={signatureMenu}
            onAccept={() => void accept()}
            onAgain={() => void again()}
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

function Shuffling() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => v + 1), TICK_MS);
    return () => clearInterval(t);
  }, []);
  const label = CATEGORIES[i % CATEGORIES.length];

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border p-6">
      <span aria-hidden="true" className="text-display">
        {label}
      </span>
      <span className="text-caption text-muted-foreground">고르는 중</span>
    </div>
  );
}

function Result({
  restaurant: r,
  signatureMenu,
  onAccept,
  onAgain,
}: {
  restaurant: NearbyRestaurant;
  signatureMenu: string | null;
  onAccept: () => void;
  onAgain: () => void;
}) {
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
        {r.memo && (
          <p className="text-caption text-muted-foreground">{r.memo}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* 버튼은 실제로 일어나는 일을 쓴다 (CLAUDE.md) */}
        <Button onClick={onAccept}>여기로 갈게요</Button>
        <Button variant="outline" onClick={onAgain}>
          다시 뽑기
        </Button>
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
