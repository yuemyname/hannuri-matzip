"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { CATEGORY_MAX_LEN } from "@/lib/categories";
import {
  addCategory,
  adminLogin,
  adminLogout,
  adminStatus,
  deleteRestaurant,
  deleteReview,
  listCategories,
  listRestaurants,
  listReviews,
  patchRestaurant,
  patchReview,
  removeCategory,
  renameCategory,
  type AdminRestaurant,
  type AdminReview,
} from "./api";

/**
 * 관리자 화면 (2026-08-09 요청).
 *
 * **지도 셸 위의 모달이 아니다.** 여기서 하는 일(남의 리뷰 고치기, 맛집 지우기)은
 * 점심 고르기와 성격이 다르고, 뒤에 지도가 살아 있을 이유도 없다. 그래서 별개
 * 풀페이지고 `src/middleware.ts` 의 "주소창 진입은 메인으로" 규칙에서 빼 뒀다 —
 * 주소창이 여기 오는 유일한 길이다.
 *
 * 신원이 없는 앱이라 (SPEC §2.4) 관문은 **공용 비밀번호 하나**다. 비밀번호는
 * 서버에만 있고, 통과하면 12시간짜리 httpOnly 쿠키를 받는다.
 */
export function AdminView() {
  const status = useQuery({
    queryKey: ["admin", "status"],
    queryFn: adminStatus,
    retry: false,
  });

  if (status.isPending) {
    return <p className="text-body text-muted-foreground">확인 중</p>;
  }

  // 비밀번호를 안 걸어 뒀으면 라우트가 404 를 준다. 그때는 "틀렸다" 가 아니라
  // "아직 켜지 않았다" 로 말해야 한다 — 고칠 자리가 화면이 아니라 서버 설정이다.
  if (status.isError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body">관리자 기능이 아직 켜져 있지 않아요</p>
        <p className="text-caption text-muted-foreground">
          서버에 <code>ADMIN_PASSWORD</code> 를 설정하면 열립니다.
          <br />
          <code>NEXT_PUBLIC_</code> 을 붙이면 안 됩니다 — 붙이는 순간 비밀번호가
          브라우저로 나갑니다.
        </p>
        <Link href="/" className="text-label text-brand-700">
          지도로 돌아가기
        </Link>
      </div>
    );
  }

  if (!status.data?.ok) return <LoginForm />;
  return <Console />;
}

function LoginForm() {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => adminLogin(password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });

  return (
    <form
      className="flex max-w-[24rem] flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (password.length > 0) login.mutate();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-label font-medium">관리자 비밀번호</span>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          aria-invalid={login.isError}
        />
      </label>
      {login.isError && (
        <p role="alert" className="text-caption text-danger">
          {login.error.message}
        </p>
      )}
      <Button type="submit" disabled={password.length === 0 || login.isPending}>
        {login.isPending ? "확인 중" : "들어가기"}
      </Button>
      <Link href="/" className="text-label text-brand-700">
        지도로 돌아가기
      </Link>
    </form>
  );
}

const TABS = [
  { key: "reviews", label: "리뷰" },
  { key: "restaurants", label: "맛집" },
  { key: "categories", label: "종류" },
] as const;

function Console() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("reviews");
  const logout = useMutation({
    mutationFn: adminLogout,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="관리 대상" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-chip px-3 py-1.5 text-label ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
          나가기
        </Button>
      </div>

      {tab === "reviews" && <Reviews />}
      {tab === "restaurants" && <Restaurants />}
      {tab === "categories" && <Categories />}
    </div>
  );
}

/** 목록 화면의 공통 껍데기 — 로딩·에러·빈 상태를 한 군데서 처리한다 */
function Section<T>({
  queryKey,
  queryFn,
  empty,
  children,
}: {
  queryKey: QueryKey;
  queryFn: () => Promise<T[]>;
  empty: string;
  children: (items: T[]) => React.ReactNode;
}) {
  const q = useQuery({ queryKey, queryFn, retry: false });

  if (q.isPending)
    return <p className="text-body text-muted-foreground">불러오는 중</p>;
  if (q.isError)
    return (
      <p role="alert" className="flex items-center gap-2 text-body">
        <span className="text-muted-foreground">{q.error.message}</span>
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="text-label font-medium text-brand-700"
        >
          다시 시도
        </button>
      </p>
    );
  if ((q.data ?? []).length === 0)
    return <p className="text-body text-muted-foreground">{empty}</p>;
  return <>{children(q.data ?? [])}</>;
}

const ROW = "flex flex-col gap-2 rounded-lg border border-border p-3";

function Reviews() {
  return (
    <Section
      queryKey={["admin", "reviews"]}
      queryFn={listReviews}
      empty="아직 리뷰가 없어요"
    >
      {(reviews) => (
        <ul className="flex flex-col gap-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <ReviewRow review={r} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ReviewRow({ review }: { review: AdminReview }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(String(review.rating));
  const [comment, setComment] = useState(review.comment ?? "");
  const done = () => qc.invalidateQueries({ queryKey: ["admin", "reviews"] });

  const save = useMutation({
    mutationFn: () =>
      patchReview({ id: review.id, rating: Number(rating), comment }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => deleteReview(review.id),
    onSuccess: done,
  });

  const dirty =
    rating !== String(review.rating) || comment !== (review.comment ?? "");

  return (
    <div className={ROW}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-subtitle">
          {review.restaurants?.name ?? "이름 없음"}
        </span>
        <span className="tnum shrink-0 text-caption text-muted-foreground">
          {review.visited_on ?? review.created_at.slice(0, 10)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-label">
          별점
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="rounded-sm border border-input bg-background px-2 py-1"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="코멘트 없음"
          aria-label="코멘트"
          className="min-w-0 flex-1"
        />
      </div>

      {(save.isError || remove.isError) && (
        <p role="alert" className="text-caption text-danger">
          {(save.error ?? remove.error)?.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "저장 중" : "리뷰 고치기"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="danger">
              리뷰 삭제
            </Button>
          }
          title="이 리뷰를 지울까요?"
          description="지운 리뷰는 되돌릴 수 없어요. 사진도 함께 사라집니다."
          confirmLabel="리뷰 삭제"
          onConfirm={() => remove.mutate()}
        />
      </div>
    </div>
  );
}

function Restaurants() {
  return (
    <Section
      queryKey={["admin", "restaurants"]}
      queryFn={listRestaurants}
      empty="아직 등록된 맛집이 없어요"
    >
      {(items) => (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li key={r.id}>
              <RestaurantRow restaurant={r} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function RestaurantRow({ restaurant }: { restaurant: AdminRestaurant }) {
  const qc = useQueryClient();
  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: listCategories,
    retry: false,
  });
  const [name, setName] = useState(restaurant.name);
  const [category, setCategory] = useState(restaurant.category);
  const [memo, setMemo] = useState(restaurant.memo ?? "");

  const done = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
    // 지도 쪽 목록도 같이 턴다. 안 그러면 고쳐 놓고 지도로 나갔을 때 예전 이름이다.
    void qc.invalidateQueries({ queryKey: ["restaurants"] });
  };

  const save = useMutation({
    mutationFn: () =>
      patchRestaurant({ id: restaurant.id, name, category, memo }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => deleteRestaurant(restaurant.id),
    onSuccess: done,
  });

  const dirty =
    name !== restaurant.name ||
    category !== restaurant.category ||
    memo !== (restaurant.memo ?? "");

  return (
    <div className={ROW}>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="맛집 이름"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-label">
          종류
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-sm border border-input bg-background px-2 py-1"
          >
            {/* 지금 값이 목록에 없을 수 있다(직접 입력으로 생겼다가 이름이 바뀐 경우).
                그때도 선택지에 남겨야 셀렉트가 멋대로 첫 값으로 바뀌지 않는다. */}
            {[
              ...new Set([
                category,
                ...(categories.data ?? []).map((c) => c.name),
              ]),
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span className="text-caption text-muted-foreground">
          {restaurant.road_address ?? "주소 없음"}
        </span>
      </div>
      <Input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="사내 메모 없음"
        aria-label="사내 메모"
      />

      {(save.isError || remove.isError) && (
        <p role="alert" className="text-caption text-danger">
          {(save.error ?? remove.error)?.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "저장 중" : "맛집 고치기"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="danger">
              맛집 삭제
            </Button>
          }
          title={`${restaurant.name} 을 지울까요?`}
          description="달린 리뷰와 메뉴도 함께 사라져요. 되돌릴 수 없습니다."
          confirmLabel="맛집 삭제"
          onConfirm={() => remove.mutate()}
        />
      </div>
    </div>
  );
}

function Categories() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState("");
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    void qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
    // 앱 쪽 필터칩·등록 폼도 같은 목록을 쓴다.
    void qc.invalidateQueries({ queryKey: ["categories"] });
  };
  const add = useMutation({
    mutationFn: () => addCategory(adding),
    onSuccess: () => {
      setAdding("");
      done();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding.trim().length > 0) add.mutate();
        }}
      >
        <div className="flex gap-2">
          <Input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            maxLength={CATEGORY_MAX_LEN}
            placeholder="새 종류 이름"
            aria-label="새 종류 이름"
          />
          <Button
            type="submit"
            size="sm"
            disabled={adding.trim().length === 0 || add.isPending}
          >
            종류 추가
          </Button>
        </div>
        {add.isError && (
          <p role="alert" className="text-caption text-danger">
            {add.error.message}
          </p>
        )}
      </form>

      <Section
        queryKey={["admin", "categories"]}
        queryFn={listCategories}
        empty="종류가 하나도 없어요"
      >
        {(items) => (
          <ul className="flex flex-col gap-2">
            {items.map((c) => (
              <li key={c.name}>
                <CategoryRow name={c.name} usedBy={c.usedBy} onDone={done} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CategoryRow({
  name,
  usedBy,
  onDone,
}: {
  name: string;
  usedBy: number;
  onDone: () => void;
}) {
  const [next, setNext] = useState(name);
  const rename = useMutation({
    mutationFn: () => renameCategory(name, next),
    onSuccess: onDone,
  });
  const remove = useMutation({
    mutationFn: () => removeCategory(name),
    onSuccess: onDone,
  });

  return (
    <div className={ROW}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={next}
          onChange={(e) => setNext(e.target.value)}
          maxLength={CATEGORY_MAX_LEN}
          aria-label={`${name} 이름`}
          className="min-w-0 flex-1"
        />
        <span className="tnum shrink-0 text-caption text-muted-foreground">
          {usedBy}곳
        </span>
      </div>

      {(rename.isError || remove.isError) && (
        <p role="alert" className="text-caption text-danger">
          {(rename.error ?? remove.error)?.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={next === name || rename.isPending}
          onClick={() => rename.mutate()}
        >
          {rename.isPending ? "저장 중" : "이름 바꾸기"}
        </Button>
        {/* 쓰이는 중이면 DB 가 막는다. 버튼을 아예 안 그려서 헛수고를 줄인다 —
            눌러 놓고 에러를 보는 것보다 왜 못 지우는지 먼저 보이는 게 낫다. */}
        {usedBy === 0 ? (
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="danger">
                종류 삭제
              </Button>
            }
            title={`${name} 을 지울까요?`}
            description="쓰는 맛집이 없어서 바로 지울 수 있어요."
            confirmLabel="종류 삭제"
            onConfirm={() => remove.mutate()}
          />
        ) : (
          <span className="self-center text-caption text-muted-foreground">
            쓰는 맛집이 있어 못 지워요
          </span>
        )}
      </div>
    </div>
  );
}
