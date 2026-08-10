"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryChip } from "@/components/category-chip";
import { Distance } from "@/components/distance";
import {
  categoryError,
  normalizeCategory,
  CATEGORY_MAX_LEN,
  type Category,
} from "@/lib/categories";
import {
  ensureCategory,
  useCategories,
  CATEGORIES_KEY,
} from "@/features/categories/api";
import { useMapView } from "@/features/map/map-store";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { areaNamesOf } from "@/features/map/reverse-geocode";
import { usePinMode } from "./pin-store";
import { usePlaceSearch, type PlaceCandidate } from "./use-place-search";
import {
  createRestaurant,
  findDuplicate,
  DuplicateRestaurantError,
  type NewMenu,
} from "./create";
import { PRICE_LABEL } from "./price";
import { MOODS, type Mood } from "@/lib/moods";
import {
  reservationUrlError,
  normalizeReservationUrl,
  RESERVATION_URL_MAX_LEN,
} from "@/lib/reservation";
import { Switch } from "@/components/ui/switch";

/**
 * 맛집 등록 (SPEC §4.4 / SHELL.md §4). 3단계다.
 *
 *   1 이름 검색 → 후보 선택       모달 전체
 *   2 지도에서 핀 미세조정         모달이 하단으로 내려가고 배경 지도를 쓴다
 *   3 카테고리·가격·메모·메뉴      모달 전체
 *
 * **2단계에서 모달 안에 지도를 새로 만들지 않는다.** 인스턴스가 둘이 되면
 * 메모리·NCP 요청이 두 배가 된다 (SHELL.md §4). 배경의 메인 지도를 그대로 쓰고,
 * 좌표는 지도가 이미 쓰고 있는 `map-store.center` 에서 읽는다.
 *
 * `canPin` 이 false 면(풀페이지 fallback — 배경에 지도가 없다) 2단계를 건너뛰고
 * 검색 좌표를 그대로 쓴다. 그 사실을 화면에 적어 준다.
 */
export type Step = "search" | "pin" | "detail";

/** 매번 새 배열을 만들면 쿼리 키가 바뀌어 검색이 다시 나간다 */
const EMPTY_AREAS: string[] = [];

export function RestaurantNewView({ canPin }: { canPin: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { center: geoCenter } = useCurrentPosition();
  const mapCenter = useMapView((s) => s.center);
  const startPin = usePinMode((s) => s.start);
  const stopPin = usePinMode((s) => s.stop);

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PlaceCandidate | null>(null);
  /** 직접 입력 경로. 검색이 막혀도 등록은 되어야 한다 (SPEC §4.4) */
  const [manualName, setManualName] = useState("");

  const [category, setCategory] = useState<Category | null>(null);
  // 목록에 없는 종류를 직접 적는 칸. 열려 있을 때만 값이 의미를 갖는다.
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const categoryList = useCategories();
  const [priceRange, setPriceRange] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  // 예약 (2026-08-09). 두 값을 서로 묶지 않는다 — 전화로만 받는 집이 있다.
  const [reservable, setReservable] = useState(false);
  const [reservationUrl, setReservationUrl] = useState("");
  // 상황 태그 (SPEC §3.2). 점메추가 시간대별로 가중치를 다르게 주는 축이다.
  const [moods, setMoods] = useState<Mood[]>([]);
  const [menus, setMenus] = useState<NewMenu[]>([
    { name: "", price: null, isSignature: true },
  ]);

  // 핀으로 확정한 좌표. null 이면 아직 검색 결과 좌표를 쓴다.
  const [pinned, setPinned] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  // 위치를 확정할 때 미리 보는 중복 검사 (create.ts findDuplicate).
  // 저장 시점 검사는 그대로 둔다 — 동시에 등록하는 경우는 인덱스만이 막는다.
  const [dupAtPin, setDupAtPin] = useState<string | null>(null);

  const debounced = useDebounced(query, 400);

  // 지역검색 API 가 좌표를 안 받는다. 지금 보고 있는 곳의 지역명(동·구)을 얻어
  // 검색어에 붙이는 게 근처로 좁히는 유일한 방법이다 (SPEC §4.4).
  // 못 얻으면 빈 배열 — 예전처럼 전국 기준으로 찾는다. 등록을 막지는 않는다.
  const here = mapCenter ?? geoCenter;
  const { data: areas = EMPTY_AREAS } = useQuery({
    queryKey: ["area", here.lat.toFixed(3), here.lng.toFixed(3)],
    queryFn: () => areaNamesOf(here),
    // 소수점 3자리(약 100m)로 묶는다. 지도를 조금 움직일 때마다 다시 부를 이유가 없다.
    staleTime: 30 * 60_000,
    retry: false,
  });

  const search = usePlaceSearch(debounced, areas);

  // 지역명을 붙여도 먼 데가 섞여 온다 (체인점은 상호에 지역이 안 붙는다).
  // 가까운 순으로 세워 두면 눈으로 고르기 쉽다.
  const places = useMemo(() => {
    const list = search.data?.places ?? [];
    return [...list].sort((a, b) => distanceM(here, a) - distanceM(here, b));
  }, [search.data, here]);

  // 핀 단계에 들어가고 나갈 때만 배경 지도에 신호를 준다.
  // 모달이 언마운트될 때 반드시 꺼야 한다 — 안 그러면 메인에 핀이 남는다.
  //
  // 들어갈 때 **검색 좌표를 함께 넘겨 지도를 그리로 옮긴다.** 안 그러면 핀이
  // 내가 보던 자리(내 위치·사무실)에 찍혀서, 미세조정이 아니라 가게를 지도에서
  // 처음부터 찾아가야 한다. 직접 입력이라 좌표를 모르면 null 을 넘긴다.
  //
  // `pickedRef` 로 읽는 이유: 이 이펙트는 `step` 이 바뀔 때만 돌아야 한다.
  // `picked` 를 의존성에 넣으면 핀을 끌어 놓은 뒤 무언가 다시 렌더될 때
  // 지도가 검색 좌표로 되돌아간다.
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(() => {
    if (step !== "pin") {
      stopPin();
      return;
    }
    const p = pickedRef.current;
    startPin(p ? { lat: p.lat, lng: p.lng } : null);
    return () => stopPin();
  }, [step, startPin, stopPin]);

  const name = picked?.name ?? manualName.trim();

  // 직접 입력 칸이 열려 있으면 그쪽이 이긴다. 칩과 입력칸 둘 다에서 값이 나오면
  // 무엇으로 저장될지 화면만 봐서는 알 수 없다 — 한쪽만 살아 있게 한다.
  const customName = normalizeCategory(custom);
  const customProblem = custom.length > 0 ? categoryError(customName) : null;
  const chosenCategory: Category | null = customOpen
    ? customProblem || customName.length === 0
      ? null
      : customName
    : category;
  const coords =
    pinned ?? (picked ? { lat: picked.lat, lng: picked.lng } : geoCenter);

  // 링크가 잘못됐으면 저장 버튼을 막는다. 여기서 안 막으면 DB 제약이 던지는
  // 23514 를 만나는데, 그건 "등록하지 못했어요" 로만 보여서 어디가 문제인지 모른다.
  const reservationProblem = reservationUrlError(reservationUrl);

  // 위치를 확정하는 순간 물어본다. 여기서 걸리면 폼을 채우기 전에 되돌아간다.
  const checkDup = useMutation({
    mutationFn: (at: { lat: number; lng: number }) => findDuplicate(name, at),
    onSuccess: (hit, at) => {
      setDupAtPin(hit);
      if (hit) return;
      setPinned(at);
      setStep("detail");
    },
    onError: (_e, at) => {
      // 못 물어봤다고 등록을 막지 않는다. 저장할 때 인덱스가 다시 본다.
      setDupAtPin(null);
      setPinned(at);
      setStep("detail");
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      // 목록에 없는 이름이면 **맛집보다 먼저** 종류를 만든다.
      // restaurants.category 가 categories 를 가리키는 외래키라, 순서가 뒤집히면
      // 등록이 통째로 실패한다.
      if (chosenCategory && !(categoryList.data ?? []).includes(chosenCategory)) {
        await ensureCategory(chosenCategory);
      }
      return createRestaurant({
        name,
        category: chosenCategory!,
        address: picked?.address ?? null,
        roadAddress: picked?.roadAddress ?? null,
        lat: coords.lat,
        lng: coords.lng,
        priceRange,
        phone: picked?.telephone || null,
        memo: memo.trim() || null,
        naverPlaceUrl: picked?.link || null,
        moodTags: moods,
        reservable,
        reservationUrl: normalizeReservationUrl(reservationUrl),
        menus,
      });
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ["restaurants", "nearby"] });
      // 새 종류가 생겼을 수 있다. 필터칩·점메추가 같은 목록을 쓰므로 같이 턴다.
      await qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
      // 등록 직후 상세로 (SPEC §4.4-5). replace 라 뒤로가기가 등록 폼으로 안 돌아온다.
      router.replace(`/restaurants/${id}`);
    },
  });

  // ── 1단계: 이름 검색 ────────────────────────────────────────────
  if (step === "search") {
    return (
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-label font-medium">가게 이름</span>
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setManualName(e.target.value);
              setPicked(null);
            }}
            placeholder="한누리해장국"
            enterKeyHint="search"
          />
        </label>

        {search.isFetching && (
          <p className="text-caption text-muted-foreground">찾는 중</p>
        )}

        {search.data?.error && (
          // 검색이 막혀도 등록은 계속된다. 다음 행동을 알려준다 (CLAUDE.md)
          <p role="status" className="text-caption text-muted-foreground">
            {search.data.error}
          </p>
        )}

        {places.length > 0 && (
          <ul className="flex flex-col gap-2">
            {places.map((p) => (
              <li key={`${p.name}-${p.lat}-${p.lng}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(p);
                    setManualName(p.name);
                    setPinned(null);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-lg border p-3 text-left ${
                    picked?.name === p.name && picked.lat === p.lat
                      ? "border-brand-600 bg-accent"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-subtitle">
                      {p.name}
                    </span>
                    {/* 어디가 가까운지 글자로 적는다. 순서만으로는 알기 어렵다 */}
                    <Distance meters={distanceM(here, p)} />
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {p.roadAddress || p.address}
                  </span>
                  {p.category && (
                    <span className="text-caption text-muted-foreground">
                      {p.category}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {debounced.length >= 2 &&
          !search.isFetching &&
          places.length === 0 &&
          !search.data?.error && (
            <p role="status" className="text-caption text-muted-foreground">
              검색 결과가 없어요. 이름을 그대로 쓰고 위치는 직접 잡으면 돼요
            </p>
          )}

        <div className="flex items-center gap-2">
          <Button
            disabled={name.length === 0}
            onClick={() => setStep(canPin ? "pin" : "detail")}
          >
            {canPin ? "위치 잡기" : "다음"}
          </Button>
          {!picked && name.length > 0 && (
            <span className="text-caption text-muted-foreground">
              직접 입력한 이름으로 등록해요
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── 2단계: 핀 미세조정 (모달은 하단, 배경 지도를 쓴다) ──────────
  if (step === "pin") {
    const shown = mapCenter ?? coords;
    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-label font-medium">{name}</p>
          <p className="text-caption text-muted-foreground">
            지도를 움직여 가게 위치를 화면 가운데 핀에 맞춰 주세요
          </p>
        </div>

        <p className="tnum text-caption text-muted-foreground">
          {shown.lat.toFixed(6)}, {shown.lng.toFixed(6)}
          {picked && (
            <>
              {" · 검색 위치에서 "}
              <Distance meters={distanceM(shown, picked)} />
            </>
          )}
        </p>

        {dupAtPin && (
          <p role="alert" className="text-caption text-danger">
            {`"${dupAtPin}" 이 이 자리에 이미 있어요. 이름을 다시 고르거나 위치를 옮겨 주세요`}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            disabled={checkDup.isPending}
            onClick={() => checkDup.mutate({ lat: shown.lat, lng: shown.lng })}
          >
            {checkDup.isPending ? "확인 중" : "이 위치로 할게요"}
          </Button>
          <Button variant="ghost" onClick={() => setStep("search")}>
            이름 다시 고르기
          </Button>
        </div>
      </div>
    );
  }

  // ── 3단계: 나머지 정보 ──────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-title">{name}</p>
        <p className="tnum text-caption text-muted-foreground">
          {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
        </p>
        {!canPin && (
          <p className="text-caption text-muted-foreground">
            위치 미세조정은 메인 화면에서 등록할 때 할 수 있어요
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">
          카테고리 <span className="text-danger">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {(categoryList.data ?? []).map((c) => (
            <CategoryChip
              key={c}
              category={c}
              selected={!customOpen && category === c}
              onToggle={(v) => {
                setCustomOpen(false);
                setCategory(v);
              }}
            />
          ))}
          {/* 목록에 마땅한 게 없을 때. 「기타」로 밀어 넣으면 나중에 아무도
              그게 뭐였는지 모른다 — 적은 이름이 그대로 새 종류가 된다. */}
          <button
            type="button"
            aria-pressed={customOpen}
            onClick={() => setCustomOpen((v) => !v)}
            className={`inline-flex shrink-0 items-center rounded-chip px-3 py-1.5 text-label transition-colors ${
              customOpen
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            직접 입력
          </button>
        </div>

        {customOpen && (
          <div className="flex flex-col gap-1">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={CATEGORY_MAX_LEN}
              placeholder="예: 아시안"
              aria-label="새 종류 이름"
              aria-invalid={customProblem !== null}
              aria-describedby="category-custom-help"
            />
            <p
              id="category-custom-help"
              // 문제가 있으면 그것만 말한다. 규칙을 늘어놓는 것보다 짧다.
              className={`text-caption ${
                customProblem ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {customProblem ?? "한글·영문으로 짧게. 새 종류로 추가돼요"}
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">
          어떤 자리에 좋아요{" "}
          <span className="font-normal text-muted-foreground">
            (안 골라도 돼요)
          </span>
        </legend>
        {/* 점메추가 이걸 본다 — 점심엔 혼밥·가벼움, 저녁엔 회식·가벼움·술 쪽을
            더 자주 뽑는다. 안 고르면 어느 쪽으로도 안 기운다. */}
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => {
            const on = moods.includes(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setMoods((prev) =>
                    prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                  )
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-chip px-3 py-1.5 text-label transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {on && <span aria-hidden="true">✓</span>}
                {m}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">가격대</legend>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={priceRange === p}
              onClick={() => setPriceRange(priceRange === p ? null : p)}
              className={`rounded-chip px-3 py-1.5 text-label ${
                priceRange === p
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {PRICE_LABEL[p]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">예약</legend>
        {/* 스위치는 색만으로 켜짐을 말한다. 옆에 글자를 함께 둔다 (CLAUDE.md) */}
        <div className="flex items-center gap-2">
          <Switch
            id="reservable"
            checked={reservable}
            onCheckedChange={(v) => setReservable(v === true)}
          />
          <label htmlFor="reservable" className="text-body">
            {reservable ? "예약 받아요" : "예약 안 받아요"}
          </label>
        </div>

        {/* 링크는 예약을 켠 경우에만 묻는다. 안 받는 집에 링크 칸이 떠 있으면
            "여기 뭘 넣어야 하나" 를 매번 생각하게 된다. */}
        {reservable && (
          <div className="flex flex-col gap-1">
            <Input
              type="url"
              inputMode="url"
              value={reservationUrl}
              onChange={(e) => setReservationUrl(e.target.value)}
              maxLength={RESERVATION_URL_MAX_LEN}
              placeholder="https://booking.naver.com/..."
              aria-label="예약 링크"
              aria-invalid={reservationProblem !== null}
              aria-describedby="reservation-help"
            />
            <p
              id="reservation-help"
              className={`text-caption ${
                reservationProblem ? "text-danger" : "text-muted-foreground"
              }`}
            >
              {reservationProblem ?? "전화로만 받으면 비워 두세요"}
            </p>
          </div>
        )}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium">사내 메모</span>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="웨이팅 김, 12시 전 도착 추천"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 placeholder:text-ink-400"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">메뉴</legend>
        {menus.map((m, i) => (
          // grid 로 잡는다. flex 는 Input 의 `w-full` 때문에 이름 칸이 안 줄어들어서
          // 360px 에서 가격 칸과 [대표] 가 화면 밖으로 밀려난다.
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_5rem_auto_auto] items-center gap-2"
          >
            <Input
              value={m.name}
              onChange={(e) =>
                updateMenu(setMenus, i, { name: e.target.value })
              }
              placeholder="뼈해장국"
              className="min-w-0"
            />
            <Input
              type="number"
              inputMode="numeric"
              value={m.price ?? ""}
              onChange={(e) =>
                updateMenu(setMenus, i, {
                  price: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder="가격"
              className="min-w-0"
            />
            <button
              type="button"
              aria-pressed={m.isSignature}
              aria-label={`${m.name || `${i + 1}번째 메뉴`} 대표메뉴로 지정`}
              onClick={() =>
                setMenus((prev) =>
                  // 대표메뉴는 하나만. 여러 개면 상세에서 뱃지가 줄줄이 붙는다.
                  prev.map((x, j) => ({ ...x, isSignature: j === i })),
                )
              }
              className={`shrink-0 rounded-chip px-2.5 py-1.5 text-label ${
                m.isSignature
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              대표
            </button>
            {/* 상세의 메뉴 편집기와 같은 자리·같은 이름. 추가만 되고 못 지우면
                한 줄 잘못 만든 사람이 빈 줄을 달고 등록하게 된다. */}
            <button
              type="button"
              aria-label={`${m.name || `${i + 1}번째 메뉴`} 지우기`}
              onClick={() => setMenus((prev) => removeMenu(prev, i))}
              className="shrink-0 rounded-chip px-2 py-1.5 text-label text-muted-foreground hover:bg-muted"
            >
              삭제
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setMenus((prev) => [
              ...prev,
              { name: "", price: null, isSignature: false },
            ])
          }
        >
          메뉴 추가
        </Button>
      </fieldset>

      {save.isError && (
        <p role="alert" className="text-caption text-danger">
          {save.error instanceof DuplicateRestaurantError
            ? save.error.message
            : "등록하지 못했어요. 잠시 후 다시 눌러 주세요."}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          disabled={
            chosenCategory === null ||
            name.length === 0 ||
            reservationProblem !== null ||
            save.isPending
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "등록 중" : "맛집 등록하기"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setStep(canPin ? "pin" : "search")}
          disabled={save.isPending}
        >
          뒤로
        </Button>
      </div>
    </div>
  );
}

function updateMenu(
  set: React.Dispatch<React.SetStateAction<NewMenu[]>>,
  index: number,
  patch: Partial<NewMenu>,
) {
  set((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
}

/** 두 지점 사이 거리(m). 핀을 얼마나 옮겼는지 보여주는 용도라 근사로 충분하다 */
/**
 * 메뉴 한 줄 지우기.
 *
 * **대표메뉴를 지웠으면 남은 첫 줄을 대표로 올린다.** 안 그러면 대표가 하나도
 * 없는 채로 저장돼서, 점메추 결과 카드에 대표메뉴 줄이 조용히 사라진다.
 * 다 지우면 빈 배열 — 메뉴 없이 등록하는 건 정상이다 (상세에서 나중에 채운다).
 */
function removeMenu(menus: NewMenu[], i: number): NewMenu[] {
  const left = menus.filter((_, j) => j !== i);
  if (left.length === 0 || left.some((m) => m.isSignature)) return left;
  return left.map((m, j) => ({ ...m, isSignature: j === 0 }));
}

function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** 타이핑마다 부르면 하루 쿼터가 금방 닳는다 */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
