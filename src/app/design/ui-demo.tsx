"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/alert-dialog";

export function UiDemo() {
  const [excludeRecent, setExcludeRecent] = useState(true);
  const [deleted, setDeleted] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Row label="Button">
        <Button>리뷰 남기기</Button>
        <Button variant="secondary">나중에</Button>
        <Button variant="outline">필터</Button>
        <Button variant="ghost">더보기</Button>
        <Button variant="danger">리뷰 삭제</Button>
        <Button size="sm">작게</Button>
        <Button disabled>비활성</Button>
      </Row>

      <Row label="Input">
        <Input placeholder="맛집 이름을 검색해 보세요" />
      </Row>

      <Row label="Badge">
        <Badge>분식</Badge>
        <Badge variant="brand">대표메뉴</Badge>
        <Badge variant="danger">영업 종료</Badge>
      </Row>

      <Row label="Skeleton">
        <div className="flex w-full flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Row>

      <Row label="Switch">
        {/* 색만으로 알리지 않도록 라벨을 함께 둔다 */}
        <label className="flex items-center gap-2">
          <Switch checked={excludeRecent} onCheckedChange={setExcludeRecent} />
          <span className="text-label">
            최근 간 곳 제외 {excludeRecent ? "켬" : "끔"}
          </span>
        </label>
      </Row>

      <Row label="DropdownMenu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              정렬
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>거리순</DropdownMenuItem>
            <DropdownMenuItem>별점순</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>리뷰 많은 순</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>

      <Row label="ConfirmDialog">
        <ConfirmDialog
          trigger={
            <Button variant="danger" size="sm">
              리뷰 삭제
            </Button>
          }
          title="리뷰를 지울까요?"
          description="지운 리뷰는 되돌릴 수 없어요."
          confirmLabel="리뷰 삭제"
          onConfirm={() => setDeleted(true)}
        />
        <span className="text-caption text-muted-foreground">
          {deleted ? "삭제됨" : "아직 그대로"}
        </span>
      </Row>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
