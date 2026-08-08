"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Rating } from "@/components/rating";
import { fetchMyPage, renameMe, NAME_MAX } from "./api";

const KEY = ["me"] as const;

/**
 * `/me` — 내 리뷰 / 내가 등록한 맛집 / 추천 히스토리 + 닉네임 변경 (SPEC §4.5).
 * 모달과 풀페이지 fallback 이 이 컴포넌트 하나를 쓴다.
 */
export function MeView() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: KEY,
    queryFn: fetchMyPage,
  });

  if (isError) {
    return (
      <Empty title="내 정보를 불러오지 못했어요">
        <Button onClick={() => void refetch()}>다시 시도</Button>
      </Empty>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Empty title="아직 준비되지 않았어요" hint="잠시 후 다시 열어 주세요" />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <NameSection displayName={data.displayName} />

      {/* SPEC §4.5 / §2.4 — 세션이 브라우저에 저장된다는 사실을 한 줄로 알린다.
          이걸 안 적으면 기기를 바꾼 사람이 자기 리뷰가 사라졌다고 생각한다. */}
      <p className="rounded-md border border-border bg-muted px-3 py-2 text-caption text-muted-foreground">
        이 기기에서만 내 기록으로 인식돼요. 브라우저를 바꾸거나 저장소를 비우면
        새 사용자가 되고 지금 기록은 따라오지 않아요
      </p>

      <Section title="내 리뷰" count={data.reviews.length}>
        {data.reviews.length === 0 ? (
          <EmptyLine
            text="아직 남긴 리뷰가 없어요"
            action={
              <Link href="/" className="text-brand-700">
                맛집 둘러보기
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.reviews.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/restaurants/${v.restaurantId}`}
                  className="flex flex-col gap-1 rounded-lg border border-border p-3 hover:bg-accent"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-subtitle">
                      {v.restaurantName}
                    </span>
                    {v.visitedOn && (
                      <span className="tnum shrink-0 text-caption text-muted-foreground">
                        {v.visitedOn}
                      </span>
                    )}
                  </span>
                  <Rating value={v.rating} />
                  {v.comment && (
                    <span className="truncate text-caption text-muted-foreground">
                      {v.comment}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="내가 등록한 맛집" count={data.restaurants.length}>
        {data.restaurants.length === 0 ? (
          <EmptyLine
            text="아직 등록한 맛집이 없어요"
            action={
              <Link href="/restaurants/new" className="text-brand-700">
                맛집 등록하기
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.restaurants.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/restaurants/${r.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent"
                >
                  <span className="min-w-0 truncate text-subtitle">
                    {r.name}
                  </span>
                  <span className="shrink-0 text-caption text-muted-foreground">
                    {r.category}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="점메추 기록" count={data.picks.length}>
        {data.picks.length === 0 ? (
          <EmptyLine
            text="아직 뽑아본 적이 없어요"
            action={
              <Link href="/pick" className="text-brand-700">
                점메추 열기
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.picks.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Link
                  href={`/restaurants/${p.restaurantId}`}
                  className="min-w-0 truncate text-brand-700"
                >
                  {p.restaurantName}
                </Link>
                <span className="shrink-0 text-caption text-muted-foreground">
                  {p.mealType === "lunch" ? "점심" : "저녁"}
                </span>
                {/* 색만으로 알리지 않는다. 상태를 글자로 쓴다 */}
                <span className="ml-auto shrink-0">
                  {p.accepted === true ? (
                    <Badge variant="brand">갔음</Badge>
                  ) : p.accepted === false ? (
                    <Badge>다시 뽑음</Badge>
                  ) : (
                    <span className="text-caption text-muted-foreground">
                      안 고름
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function NameSection({ displayName }: { displayName: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);

  const save = useMutation({
    mutationFn: () => renameMe(name),
    onSuccess: async () => {
      // 상세의 리뷰 작성자 이름도 이걸 쓴다. 같이 무효화한다.
      await Promise.all([
        qc.invalidateQueries({ queryKey: KEY }),
        qc.invalidateQueries({ queryKey: ["restaurant"] }),
      ]);
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-title">{displayName}</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setName(displayName);
            setEditing(true);
          }}
        >
          이름 바꾸기
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length > 0 && !save.isPending) save.mutate();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium">이름</span>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          placeholder="느긋한너구리4812"
        />
      </label>

      {save.isError && (
        <p role="alert" className="text-caption text-danger">
          바꾸지 못했어요. 잠시 후 다시 눌러 주세요.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={name.trim().length === 0 || save.isPending}
        >
          {save.isPending ? "바꾸는 중" : "이름 저장"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setEditing(false)}
          disabled={save.isPending}
        >
          그만두기
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-label font-medium">
        {title} <span className="tnum text-muted-foreground">{count}</span>
      </h4>
      {children}
    </section>
  );
}

/** 빈 상태는 행동 유도 (CLAUDE.md). 각 섹션마다 갈 곳을 준다 */
function EmptyLine({
  text,
  action,
}: {
  text: string;
  action: React.ReactNode;
}) {
  return (
    <p role="status" className="flex items-center gap-2 py-2">
      <span className="text-muted-foreground">{text}</span>
      {action}
    </p>
  );
}

function Empty({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 py-10 text-center"
    >
      <p className="text-body">{title}</p>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
