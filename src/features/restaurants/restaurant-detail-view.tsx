"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rating } from "@/components/rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { signedPhotoUrls } from "@/features/reviews/api";
import { ReviewForm } from "@/features/reviews/review-form";
import { MenuEditor } from "./menu-editor";
import { detailKey, useCurrentUserId, useRestaurantDetail } from "./use-detail";
import { PRICE_LABEL } from "./price";
import {
  normalizeReservationUrl,
  reservationUrlError,
  RESERVATION_URL_MAX_LEN,
} from "@/lib/reservation";
import { saveReservation, type RestaurantDetail, type Review } from "./detail-api";

/**
 * 맛집 상세 (SPEC §4.3). 인터셉트 모달과 풀페이지 fallback 이 이 컴포넌트 하나를 쓴다.
 *
 * 리뷰 쓰기는 **여기 안에서 뷰만 바뀐다.** 모달 위에 모달을 띄우지 않는다 (SHELL.md §3).
 */
export function RestaurantDetailView({ id }: { id: string }) {
  const { data, isPending, isError, refetch } = useRestaurantDetail(id);
  const { data: userId } = useCurrentUserId();
  const [writing, setWriting] = useState(false);
  const [editingMenus, setEditingMenus] = useState(false);

  if (isError) {
    return (
      <Empty title="맛집을 불러오지 못했어요">
        <Button onClick={() => void refetch()}>다시 시도</Button>
      </Empty>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Empty title="없는 맛집이에요" hint="지워졌거나 주소가 잘못됐어요" />
    );
  }

  const mine = data.reviews.find((v) => v.userId === userId) ?? null;
  const others = data.reviews.filter((v) => v.userId !== userId);

  // 예약 정보는 **등록한 사람만** 고칠 수 있다. RLS 가 그렇게 돼 있어서
  // (`restaurants_update`: `created_by = auth.uid()`), 남에게 칸을 보여줘 봐야
  // 눌렀을 때 0행이 바뀌고 끝난다. 아예 안 보여준다.
  const owned =
    data.createdBy !== null && userId !== null && data.createdBy === userId;

  if (writing) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-title">{data.name}</h3>
          <p className="text-caption text-muted-foreground">
            {mine ? "리뷰 수정" : "리뷰 남기기"}
          </p>
        </div>
        <ReviewForm
          restaurantId={id}
          existing={mine}
          onDone={() => setWriting(false)}
          onCancel={() => setWriting(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Header data={data} />

      <section className="flex flex-col gap-2">
        <h4 className="text-label font-medium">별점</h4>
        {/* 평균 + 리뷰 수만. 점수별 분포는 뺐다 — 사내 맛집은 리뷰가 한 자릿수라
            막대 다섯 줄이 알려 주는 게 "5점 2건" 정도고, 그건 아래 리뷰 목록에
            이미 다 적혀 있다. */}
        <Rating value={data.avgRating} count={data.reviewCount} />
      </section>

      <Reservation data={data} canEdit={owned} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-label font-medium">메뉴</h4>
          {!editingMenus && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingMenus(true)}
            >
              {data.menus.length > 0 ? "메뉴 고치기" : "메뉴 추가"}
            </Button>
          )}
        </div>

        {editingMenus ? (
          <MenuEditor
            restaurantId={id}
            menus={data.menus}
            onDone={() => setEditingMenus(false)}
          />
        ) : data.menus.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {data.menus.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="min-w-0 truncate">{m.name}</span>
                {m.isSignature && <Badge variant="brand">대표메뉴</Badge>}
                {m.price !== null && (
                  <span className="tnum ml-auto text-caption text-muted-foreground">
                    {m.price.toLocaleString("ko-KR")}원
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          // 빈 상태는 행동 유도 (CLAUDE.md)
          <p className="text-caption text-muted-foreground">
            아직 메뉴가 없어요. 가보셨다면 하나 채워 주세요
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-label font-medium">
            리뷰 <span className="tnum">{data.reviewCount}</span>
          </h4>
          <Button size="sm" onClick={() => setWriting(true)}>
            {mine ? "내 리뷰 수정" : "리뷰 남기기"}
          </Button>
        </div>

        {/* 내 리뷰는 위에 고정 (SPEC §4.3) */}
        {mine && <ReviewItem review={mine} isMine />}

        {others.map((v) => (
          <ReviewItem key={v.id} review={v} />
        ))}

        {data.reviewCount === 0 && (
          // 빈 상태는 행동 유도 (CLAUDE.md)
          <p className="py-6 text-center text-muted-foreground">
            아직 리뷰가 없어요. 첫 리뷰를 남겨보세요
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * 예약 (2026-08-11). **한 칸으로 따로 뺐다.**
 *
 * 예전엔 제목 아래에 예약을 켠 곳만 조용히 버튼이 붙었다. 그래서 "예약하기가
 * 어디 있냐" 가 나왔다 — 켠 집이 하나도 없었으니 화면 어디에도 그 글자가 없었던
 * 것이다. 이제 이 칸은 **항상 있고**, 비어 있으면 비었다고 적는다. 등록한
 * 사람에게는 그 자리에서 켜는 버튼이 보인다.
 */
function Reservation({
  data,
  canEdit,
}: {
  data: RestaurantDetail;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [reservable, setReservable] = useState(data.reservable);
  const [url, setUrl] = useState(data.reservationUrl ?? "");

  // **href 로 쓰기 전에 한 번 더 본다.** DB 제약이 막고 있지만, 그 제약보다 먼저
  // 들어간 값이나 제약을 지나지 않는 경로가 생기면 여기가 마지막 문이다.
  // `javascript:` 가 통과하면 클릭 한 번에 스크립트가 돈다.
  const bookingUrl =
    data.reservationUrl && reservationUrlError(data.reservationUrl) === null
      ? data.reservationUrl
      : null;

  const problem = reservable ? reservationUrlError(url) : null;

  const save = useMutation({
    mutationFn: () =>
      saveReservation(data.id, {
        reservable,
        // 예약을 끄면 링크도 지운다. 남겨 두면 다시 켰을 때 옛 링크가 되살아난다.
        reservationUrl: reservable ? normalizeReservationUrl(url) : null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: detailKey(data.id) });
      // 목록 카드에도 예약 표시가 붙는다.
      void qc.invalidateQueries({ queryKey: ["restaurants"] });
      void qc.invalidateQueries({ queryKey: ["discover"] });
      setEditing(false);
    },
  });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-label font-medium">예약</h4>
        {canEdit && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setReservable(data.reservable);
              setUrl(data.reservationUrl ?? "");
              save.reset();
              setEditing(true);
            }}
          >
            {data.reservable ? "예약 고치기" : "예약 정보 넣기"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          {/* 스위치는 색만으로 켜짐을 말한다. 옆에 글자를 함께 둔다 (CLAUDE.md) */}
          <div className="flex items-center gap-2">
            <Switch
              id="detail-reservable"
              checked={reservable}
              onCheckedChange={(v) => setReservable(v === true)}
            />
            <label htmlFor="detail-reservable" className="text-body">
              {reservable ? "예약 받아요" : "예약 안 받아요"}
            </label>
          </div>

          {/* 링크는 켠 경우에만 묻는다. 안 받는 집에 링크 칸이 떠 있으면
              "여기 뭘 넣어야 하나" 를 매번 생각하게 된다. */}
          {reservable && (
            <div className="flex flex-col gap-1">
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={RESERVATION_URL_MAX_LEN}
                placeholder="https://booking.naver.com/..."
                aria-label="예약 링크"
                aria-invalid={problem !== null}
                aria-describedby="detail-reservation-help"
              />
              <p
                id="detail-reservation-help"
                className={`text-caption ${
                  problem ? "text-danger" : "text-muted-foreground"
                }`}
              >
                {problem ?? "전화로만 받으면 비워 두세요"}
              </p>
            </div>
          )}

          {save.isError && (
            <p role="alert" className="text-caption text-danger">
              {save.error instanceof Error
                ? save.error.message
                : "저장하지 못했어요. 다시 눌러 주세요."}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={problem !== null || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "저장 중" : "예약 정보 저장"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
            >
              취소
            </Button>
          </div>
        </div>
      ) : data.reservable ? (
        bookingUrl ? (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex self-start items-center rounded-md bg-primary px-4 py-2 text-label text-primary-foreground"
          >
            예약하기
          </a>
        ) : (
          // 링크 없이 "예약 가능" 만 띄우면 갈 데가 없어 더 답답하다. 다음 행동을 적는다.
          <p className="text-caption text-muted-foreground">
            예약 받는 곳이에요.{" "}
            {data.phone ? "전화로 물어보세요" : "링크는 아직 없어요"}
          </p>
        )
      ) : (
        // 빈 상태는 행동 유도 (CLAUDE.md)
        <p className="text-caption text-muted-foreground">
          {canEdit
            ? "예약 받는 곳이면 켜 주세요. 링크도 같이 넣을 수 있어요"
            : "예약 정보가 아직 없어요. 아신다면 등록한 분에게 알려 주세요"}
        </p>
      )}
    </section>
  );
}

function Header({ data }: { data: RestaurantDetail }) {
  const price = data.priceRange === null ? null : PRICE_LABEL[data.priceRange];
  // 네이버 지도 딥링크 (SPEC §4.3). 등록된 플레이스 URL 이 있으면 그쪽이 정확하다.
  const naverUrl =
    data.naverPlaceUrl ??
    `https://map.naver.com/p/search/${encodeURIComponent(data.name)}`;

  return (
    <header className="flex flex-col gap-2">
      <h3 className="text-title">{data.name}</h3>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        <span>{data.category}</span>
        {price && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tnum">{price}</span>
          </>
        )}
        {data.phone && (
          <>
            <span aria-hidden="true">·</span>
            <a href={`tel:${data.phone}`} className="tnum text-brand-700">
              {data.phone}
            </a>
          </>
        )}
      </div>

      {(data.roadAddress ?? data.address) && (
        <p className="text-caption text-muted-foreground">
          {data.roadAddress ?? data.address}
        </p>
      )}

      {/* 상황 태그. 점메추가 시간대별로 가중치를 주는 축이라, 여기서도 보여야
          "왜 저녁에 이게 자주 나오지" 가 설명된다 (SPEC §3.2). */}
      {data.moodTags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {data.moodTags.map((m) => (
            <li
              key={m}
              className="rounded-chip border border-border px-2 py-0.5 text-caption text-muted-foreground"
            >
              {m}
            </li>
          ))}
        </ul>
      )}

      {data.memo && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-caption">
          {data.memo}
        </p>
      )}

      <a
        href={naverUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="self-start text-label text-brand-700 underline underline-offset-2"
      >
        네이버 지도에서 열기
      </a>
    </header>
  );
}

function ReviewItem({ review, isMine }: { review: Review; isMine?: boolean }) {
  // 비공개 버킷이라 서명 URL 이 필요하다. 사진 없는 리뷰는 아예 부르지 않는다.
  const { data: urls } = useQuery({
    queryKey: ["review-photos", review.id, review.photoPaths],
    queryFn: () => signedPhotoUrls(review.photoPaths),
    enabled: review.photoPaths.length > 0,
    staleTime: 50 * 60_000, // 서명 1시간보다 짧게
  });

  return (
    <article
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        isMine ? "border-brand-600 bg-accent" : "border-border"
      }`}
    >
      {/* 1줄: 누가 · 몇 점 */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-label font-medium">
          {review.displayName}
        </span>
        {isMine && <Badge variant="brand">내 리뷰</Badge>}
        <span className="ml-auto shrink-0">
          <Rating value={review.rating} />
        </span>
      </div>

      {/* 2줄: 무슨 말 · 언제 갔는지.
          날짜는 `ml-auto` 로 민다 — 코멘트가 없을 때도 오른쪽에 있어야
          윗줄의 별점과 세로로 맞는다. justify-between 이면 왼쪽으로 붙는다. */}
      {(review.comment || review.visitedOn) && (
        <div className="flex items-baseline gap-2">
          {review.comment && (
            <p className="min-w-0 whitespace-pre-wrap">{review.comment}</p>
          )}
          {review.visitedOn && (
            <span className="tnum ml-auto shrink-0 text-caption text-muted-foreground">
              {review.visitedOn} 방문
            </span>
          )}
        </div>
      )}

      {urls && urls.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto">
          {urls.map((url, i) => (
            <li key={url}>
              {/* next/image 는 서명 URL 도메인 설정이 필요하다. 리뷰 사진은
                  이미 1600px 로 줄여 올리므로 img 로 충분하다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${review.displayName}님이 올린 사진 ${i + 1}`}
                loading="lazy"
                className="size-24 shrink-0 rounded-md border border-border object-cover"
              />
            </li>
          ))}
        </ul>
      )}
    </article>
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
