"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Distance } from "@/components/distance";
import { CategoryChip } from "@/components/category-chip";
import { categoryFromNaver, matchCategory, type Category } from "@/lib/categories";
import { ensureCategory, useCategories, CATEGORIES_KEY } from "@/features/categories/api";
import { useMapView } from "@/features/map/map-store";
import { useCurrentPosition } from "@/features/map/use-current-position";
import { areaNamesOf } from "@/features/map/reverse-geocode";
import {
  usePlaceSearch,
  useDebouncedValue,
  type PlaceCandidate,
} from "@/features/restaurants/use-place-search";
import { useHoldHeight } from "@/components/use-hold-height";
import { createRestaurant, DuplicateRestaurantError } from "@/features/restaurants/create";
import { fetchRegisteredNearby, placeKey } from "./api";
import { RestaurantCard } from "@/features/restaurants/restaurant-card";

/**
 * 주변 찾기 (2026-08-10 요청) — 처음 텅 빈 지도를 채우는 지름길.
 *
 * **"별점 4점 이상" 같은 조건은 못 건다.** 네이버 지역검색 API 가 주는 건
 * 이름·분류·주소·전화·좌표·플레이스 링크뿐이고, 별점과 후기 수는 안 준다
 * (2026-08-08 실제 응답으로 확인). 플레이스 화면에서 긁어오는 건 약관 위반이라
 * 이 프로젝트가 처음부터 안 하기로 한 것이다 (SPEC §0).
 *
 * 그래서 **품질 판단을 사람에게 남긴다.** 근처 가게를 뿌려 주기만 하고, 아는
 * 집이면 탭 한 번에 등록된다. 이름 치고 핀 찍는 과정이 통째로 빠지는 게 이
 * 화면의 값어치고, "좋은 집을 골라 준다" 는 값어치는 애초에 팔 수 없다.
 *
 * 지도에 후보 핀을 뿌리지는 않는다. 진짜 마커와 섞이면 어느 게 등록된 곳인지
 * 알 수 없고, 등록하고 나면 어차피 마커로 뜬다.
 *
 * **내 지도에 이미 있는 곳도 맨 위에 몇 개 얹는다** (2026-08-10). 네이버 것만
 * 늘어놓으면 "여긴 아무것도 없나" 로 보이고, 방금 담은 것이 어디로 갔는지도
 * 모른다. 다만 이 화면의 일은 채우는 것이라 **우리 것은 맥락일 뿐**이다 —
 * 최대 넷까지만 얹고 나머지 자리는 네이버 쪽이 가져간다.
 */
export function DiscoverView() {
  const qc = useQueryClient();
  const { center: geoCenter } = useCurrentPosition();
  const mapCenter = useMapView((s) => s.center);
  const here = mapCenter ?? geoCenter;

  const categoryList = useCategories();
  /** null 이면 "맛집" 으로 두루 찾는다. 고르면 그 종류로 좁힌다 */
  const [category, setCategory] = useState<Category | null>(null);
  /** 직접 친 검색어. 이게 있으면 종류 칩보다 이쪽이 이긴다 */
  const [typed, setTyped] = useState("");
  const debounced = useDebouncedValue(typed.trim(), 400);

  /**
   * 무엇으로 찾을지. **한 번에 하나만 산다.**
   *
   * 칩과 입력칸 둘 다에서 값이 나오면 무엇으로 찾았는지 화면만 봐서는 알 수 없다.
   * 그래서 치면 칩이 풀리고, 칩을 누르면 칸이 비워진다 (등록 폼의 종류 직접
   * 입력과 같은 규칙이다).
   *
   * 두 글자 미만은 안 보낸다 — 한 글자로는 쓸 만한 결과가 안 나오고 쿼터만 쓴다.
   */
  const query = debounced.length >= 2 ? debounced : (category ?? "맛집");

  const { data: areas = EMPTY } = useQuery({
    queryKey: ["area", here.lat.toFixed(3), here.lng.toFixed(3)],
    queryFn: () => areaNamesOf(here),
    staleTime: 30 * 60_000,
    retry: false,
  });

  // 이미 등록된 곳. 후보에서 빼는 데도 쓰고, 맨 위에 얹는 데도 쓴다.
  // 등록 직후에도 바로 반영돼야 해서 담은 뒤 이 키를 턴다.
  const registered = useQuery({
    queryKey: ["discover", "registered", here.lat.toFixed(3), here.lng.toFixed(3)],
    queryFn: () => fetchRegisteredNearby(here),
    staleTime: 60_000,
  });

  const search = usePlaceSearch(query, areas);

  // 다시 찾는 동안 결과 상자 높이를 붙잡는다. 안 그러면 시트가 내려앉았다 올라온다
  // (등록 폼에서 이미 한 번 겪었다 — use-hold-height.ts).
  const hold = useHoldHeight(search.isFetching);

  /** 맨 위에 얹는 우리 것. 가까운 순으로 목록의 ¾ 까지 (아래 주석 참고) */
  const mine = useMemo(
    () => (registered.data ?? []).slice(0, MINE_MAX),
    [registered.data],
  );

  const allCandidates = useMemo(() => {
    // **자르기 전 전체**로 거른다. 넷만 보고 거르면 다섯 번째로 가까운 등록분이
    // 네이버 후보로 또 뜨고, 눌러도 인덱스가 막는다.
    const known = new Set(
      (registered.data ?? []).map((r) => placeKey(r.name, r.lat, r.lng)),
    );
    return (search.data?.places ?? [])
      .filter((p) => !known.has(placeKey(p.name, p.lat, p.lng)))
      .sort((a, b) => distanceM(here, a) - distanceM(here, b));
  }, [search.data, registered.data, here]);

  /** 우리 것이 차지하고 남은 자리를 네이버가 가져간다 */
  const candidates = useMemo(
    () => allCandidates.slice(0, Math.max(LIST_MAX - mine.length, 0)),
    [allCandidates, mine.length],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-muted-foreground">
        내 지도에 있는 곳을 먼저 보여주고, 그 아래는 네이버에서 찾은 아직 없는
        가게예요. 아는 집을 눌러 담아 주세요. 네이버는 별점·후기 수를 안 주기
        때문에 좋은 집인지는 앱이 모릅니다
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium">가게 이름으로 찾기</span>
        <Input
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            // 치기 시작하면 칩은 풀린다. 둘이 동시에 살아 있으면 안 된다.
            if (e.target.value.trim().length > 0) setCategory(null);
          }}
          placeholder="쌀국수, 김밥천국"
          enterKeyHint="search"
          aria-describedby="discover-query"
        />
        <span id="discover-query" className="text-caption text-muted-foreground">
          {debounced.length >= 2
            ? `"${debounced}" 로 찾는 중이에요`
            : "두 글자부터 찾아요. 비워 두면 아래 종류로 찾아요"}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium">종류로 찾기</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={category === null && debounced.length < 2}
            onClick={() => {
              setTyped("");
              setCategory(null);
            }}
            className={`inline-flex shrink-0 items-center rounded-chip px-3 py-1.5 text-label transition-colors ${
              category === null && debounced.length < 2
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            두루
          </button>
          {(categoryList.data ?? []).map((c) => (
            <CategoryChip
              key={c}
              category={c}
              selected={category === c}
              onToggle={(v) => {
                // 칩을 누르면 친 글자는 비운다 (한 번에 하나만 산다)
                setTyped("");
                setCategory(category === v ? null : v);
              }}
            />
          ))}
        </div>
      </fieldset>

      <div ref={hold.ref} style={hold.style} className="flex flex-col gap-4">
      {search.isFetching && (
        <p className="text-caption text-muted-foreground">찾는 중</p>
      )}

      {search.data?.error && (
        <p role="status" className="text-caption text-muted-foreground">
          {search.data.error}
        </p>
      )}

      {mine.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-label font-medium">
            내 지도에 있는 곳{" "}
            <span className="tnum font-normal text-muted-foreground">
              {registered.data?.length ?? 0}
            </span>
          </h3>
          <ul className="flex flex-col gap-2">
            {mine.map((r) => (
              <li key={r.id}>
                <RestaurantCard restaurant={r} />
              </li>
            ))}
          </ul>
          {/* 몇 개를 감췄는지 적는다. 조용히 자르면 "이게 전부" 로 읽힌다 */}
          {(registered.data?.length ?? 0) > mine.length && (
            <p className="text-caption text-muted-foreground">
              가까운 {mine.length}곳만 보여줘요. 나머지는 지도에서 보세요
            </p>
          )}
        </section>
      )}

      {candidates.length > 0 && (
        <h3 className="text-label font-medium">네이버에서 찾은 곳</h3>
      )}

      {!search.isFetching && !search.data?.error && candidates.length === 0 && (
        // 빈 상태는 행동 유도 (CLAUDE.md). 여기서는 "다른 종류를 눌러 보라" 가 답이다.
        <p role="status" className="text-caption text-muted-foreground">
          {(search.data?.places ?? []).length > 0
            ? "찾은 곳이 전부 이미 등록돼 있어요. 다른 이름이나 종류로 찾아보세요"
            : debounced.length >= 2
              ? `"${debounced}" 로는 이 근처에서 못 찾았어요. 이름을 줄여 보거나 지도를 옮겨 보세요`
              : "이 근처에서는 못 찾았어요. 지도를 옮기거나 다른 종류를 눌러 보세요"}
        </p>
      )}

      {candidates.length > 0 && (
        <ul className="flex flex-col gap-2">
          {candidates.map((p) => (
            <li key={placeKey(p.name, p.lat, p.lng)}>
              <CandidateRow
                place={p}
                here={here}
                known={categoryList.data ?? []}
                onAdded={() => {
                  // 지도 마커와 이 목록을 같이 턴다. 방금 담은 게 계속 보이면
                  // 두 번 누르게 되고, 두 번째는 인덱스가 막는다.
                  void qc.invalidateQueries({ queryKey: ["restaurants"] });
                  void qc.invalidateQueries({ queryKey: ["discover"] });
                  // 새 종류가 생겼을 수 있다. 필터칩·점메추가 같은 목록을 쓴다.
                  void qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {allCandidates.length > candidates.length && (
        <p className="text-caption text-muted-foreground">
          네이버에서 {allCandidates.length}곳을 찾았고 {candidates.length}곳만
          보여줘요. 이름으로 찾으면 좁힐 수 있어요
        </p>
      )}
      </div>
    </div>
  );
}

const EMPTY: string[] = [];

/**
 * 목록 전체 길이와, 그중 **내 지도에 있는 곳의 몫** (2026-08-10 정정).
 *
 * 처음에 「우리 것은 맥락일 뿐」이라고 읽고 넷으로 잘랐는데, 반대였다 —
 * **우리 것이 주인공이고 네이버가 빈자리를 메운다.** 열두 줄 중 아홉(¾)까지가
 * 우리 것이고, 남는 자리를 네이버가 가져간다. 등록분이 아홉에 못 미치면 그만큼
 * 네이버 쪽이 길어진다 (지금이 그 상태다).
 *
 * 둘 다 넘치면 감춘 개수를 화면에 적는다 — 조용히 자르지 않는다 (CLAUDE.md).
 */
const LIST_MAX = 12;
const MINE_MAX = Math.floor((LIST_MAX * 3) / 4); // 9

function CandidateRow({
  place: p,
  here,
  known: knownList,
  onAdded,
}: {
  place: PlaceCandidate;
  here: { lat: number; lng: number };
  known: readonly Category[];
  onAdded: () => void;
}) {
  /**
   * 종류는 **네이버 분류를 기준으로 자동으로 정한다** (2026-08-10 요청).
   *
   *   1. 우리 목록에 있는 이름이면 그것 ("음식점>한식>해장국" → 한식)
   *   2. 없으면 네이버 중분류로 **새 종류를 만든다** ("음식점>아시아음식>…" → 아시안음식)
   *   3. 그것도 못 뽑으면(먹는 것이 아니거나 이름 규칙에 안 맞으면) 그때만 묻는다
   *
   * 2단계는 DB 에 없던 종류가 생기는 일이라, 담을 때 **맛집보다 먼저** 만든다 —
   * `restaurants.category` 가 `categories` 를 가리키는 외래키다 (CLAUDE.md).
   */
  const known = knownList;
  const matched = matchCategory(p.category, known);
  const derived = matched === null ? categoryFromNaver(p.category) : null;
  const [picked, setPicked] = useState<Category | null>(null);
  const category = matched ?? derived ?? picked;
  /** 목록에 없는 이름이면 담기 전에 종류부터 만들어야 한다 */
  const isNew = category !== null && !known.includes(category);

  /**
   * 예약 받는 곳인지 (2026-08-11 요청).
   *
   * **네이버가 알려 주는 값이 아니다.** 지역검색 응답에 예약 여부는 없다 —
   * 아는 사람이 담으면서 켜 주는 것이다. 그래서 기본값은 꺼짐이고, 여기서는
   * 켜기만 한다. **링크는 안 묻는다** — 이 화면의 값어치가 "탭 한 번" 이라
   * 주소를 붙여넣게 하면 그게 사라진다. 링크는 상세에서 넣는다.
   */
  const [reservable, setReservable] = useState(false);
  const switchId = `discover-reservable-${placeKey(p.name, p.lat, p.lng)}`;

  const add = useMutation({
    mutationFn: async () => {
      if (isNew) await ensureCategory(category!);
      return createRestaurant({
        name: p.name,
        category: category!,
        address: p.address || null,
        roadAddress: p.roadAddress || null,
        lat: p.lat,
        lng: p.lng,
        // 가격대·메모·태그는 비워 둔다. 아는 사람이 상세에서 채우면 된다 —
        // 여기서 물어보면 "탭 한 번" 이라는 이 화면의 값어치가 사라진다.
        priceRange: null,
        phone: p.telephone || null,
        memo: null,
        naverPlaceUrl: p.link || null,
        moodTags: [],
        reservable,
        reservationUrl: null,
        menus: [],
      });
    },
    onSuccess: onAdded,
  });

  return (
    // **네이버에서 온 줄은 초록 테두리.** 아직 우리 것이 아니라는 표시다 —
    // 담고 나면 지도에 평범한 마커로 뜨고, 이 초록은 거기까지 안 따라간다.
    <div className="flex flex-col gap-2 rounded-lg border border-naver bg-naver-soft p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-subtitle">{p.name}</span>
        <Distance meters={distanceM(here, p)} />
      </div>
      {/* 색만으로 알리지 않는다 (CLAUDE.md). 초록이 무슨 뜻인지 글자로 적는다 */}
      <p className="text-caption font-medium text-naver-strong">네이버 검색 결과</p>
      <p className="text-caption text-muted-foreground">
        {p.roadAddress || p.address}
      </p>
      {p.category && (
        <p className="text-caption text-muted-foreground">{p.category}</p>
      )}

      {/* 자동으로 정한 종류를 적어 둔다. 안 적으면 무엇으로 담기는지 모른 채
          누르게 되고, 틀렸을 때 고쳐도 되는지도 알 수 없다. */}
      {category !== null && (
        <p className="text-caption text-muted-foreground">
          종류 <span className="text-foreground">{category}</span>
          {isNew && " (새로 만들어져요)"}
        </p>
      )}

      {/* **자동으로도 못 정했을 때만** 묻는다 (먹는 것이 아니거나 이름 규칙에
          안 맞는 경우). 정해진 줄까지 칩을 깔면 목록이 길어져 훑기 어렵다. */}
      {matched === null && derived === null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">종류</span>
          {known.map((c) => (
            <CategoryChip
              key={c}
              category={c}
              selected={picked === c}
              onToggle={(v) => setPicked(v)}
            />
          ))}
        </div>
      )}

      {/* 스위치는 색만으로 켜짐을 말한다. 옆에 글자를 함께 둔다 (CLAUDE.md) */}
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={reservable}
          onCheckedChange={(v) => setReservable(v === true)}
        />
        <label htmlFor={switchId} className="text-caption">
          {reservable ? "예약 받는 곳이에요" : "예약 받는 곳인가요"}
        </label>
      </div>
      {reservable && (
        <p className="text-caption text-muted-foreground">
          예약 링크는 담은 뒤 상세에서 넣어요
        </p>
      )}

      {add.isError && (
        <p role="alert" className="text-caption text-danger">
          {add.error instanceof DuplicateRestaurantError
            ? "이미 등록돼 있어요"
            : "담지 못했어요. 다시 눌러 주세요."}
        </p>
      )}

      <Button
        size="sm"
        className="self-start"
        disabled={category === null || add.isPending || add.isSuccess}
        onClick={() => add.mutate()}
      >
        {add.isPending
          ? "담는 중"
          : add.isSuccess
            ? "담았어요"
            : category === null
              ? "종류를 골라 주세요"
              : "여기 담기"}
      </Button>
    </div>
  );
}

/** 얼마나 가까운지 보여주는 용도라 근사로 충분하다 */
function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}
