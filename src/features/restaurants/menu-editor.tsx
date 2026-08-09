"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Menu } from "./detail-api";
import { detailKey } from "./use-detail";
import { saveMenus, toDraft, type MenuDraft } from "./menu-api";

/**
 * 상세 화면 안의 메뉴 편집 (WBS 5.3).
 *
 * 별도 모달을 띄우지 않는다 — 상세가 이미 모달이고 그 위에 또 띄우면 2단이 된다
 * (SHELL.md §3). 리뷰 폼과 같은 방식으로 섹션만 편집 모드로 바뀐다.
 */
export function MenuEditor({
  restaurantId,
  menus,
  onDone,
}: {
  restaurantId: string;
  menus: Menu[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<MenuDraft[]>(() =>
    menus.length > 0
      ? menus.map(toDraft)
      : [{ id: null, name: "", price: null, isSignature: true }],
  );

  const save = useMutation({
    mutationFn: () => saveMenus(restaurantId, drafts, menus),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: detailKey(restaurantId) });
      onDone();
    },
  });

  // 대표메뉴를 지웠으면 남은 첫 줄을 대표로 올린다. 안 그러면 대표가 하나도
  // 없는 채로 저장돼서 점메추 결과 카드의 대표메뉴 줄이 조용히 사라진다.
  const removeDraft = (prev: MenuDraft[], i: number): MenuDraft[] => {
    const left = prev.filter((_, j) => j !== i);
    if (left.length === 0 || left.some((d) => d.isSignature)) return left;
    return left.map((d, j) => ({ ...d, isSignature: j === 0 }));
  };

  const patch = (i: number, next: Partial<MenuDraft>) =>
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...next } : d)));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted-foreground">
        메뉴는 다 같이 채우는 정보예요. 등록한 사람이 아니어도 고칠 수 있어요
      </p>

      {drafts.map((d, i) => (
        // grid 로 잡는다. Input 의 w-full 때문에 flex 에서는 이름 칸이 안 줄어든다.
        <div
          key={d.id ?? `new-${i}`}
          className="grid grid-cols-[minmax(0,1fr)_5rem_auto_auto] items-center gap-2"
        >
          <Input
            value={d.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            placeholder="뼈해장국"
            className="min-w-0"
          />
          <Input
            type="number"
            inputMode="numeric"
            value={d.price ?? ""}
            onChange={(e) =>
              patch(i, {
                price: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="가격"
            className="min-w-0"
          />
          <button
            type="button"
            aria-pressed={d.isSignature}
            aria-label={`${d.name || `${i + 1}번째 메뉴`} 대표메뉴로 지정`}
            onClick={() =>
              // 대표메뉴는 하나만. 여러 개면 결과 카드에 뭘 쓸지 정해지지 않는다.
              setDrafts((prev) =>
                prev.map((x, j) => ({ ...x, isSignature: j === i })),
              )
            }
            className={`shrink-0 rounded-chip px-2.5 py-1.5 text-label ${
              d.isSignature
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            대표
          </button>
          <button
            type="button"
            aria-label={`${d.name || `${i + 1}번째 메뉴`} 지우기`}
            onClick={() => setDrafts((prev) => removeDraft(prev, i))}
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
          setDrafts((prev) => [
            ...prev,
            { id: null, name: "", price: null, isSignature: prev.length === 0 },
          ])
        }
      >
        메뉴 추가
      </Button>

      {save.isError && (
        <p role="alert" className="text-caption text-danger">
          저장하지 못했어요. 잠시 후 다시 눌러 주세요.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "저장 중" : "메뉴 저장"}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
          그만두기
        </Button>
      </div>
    </div>
  );
}
