import type { Metadata } from "next";
import { Rating } from "@/components/rating";
import { Distance } from "@/components/distance";
import { ChipDemo } from "./chip-demo";

// 개발 전용 화면. 배포돼도 색인되지 않게 막는다.
export const metadata: Metadata = {
  title: "디자인 토큰",
  robots: { index: false, follow: false },
};

// Tailwind 는 클래스 문자열을 정적으로 읽는다. 조립하지 말고 전부 적는다.
const BRAND = [
  ["bg-brand-50", "--color-brand-50"],
  ["bg-brand-100", "--color-brand-100"],
  ["bg-brand-200", "--color-brand-200"],
  ["bg-brand-300", "--color-brand-300"],
  ["bg-brand-400", "--color-brand-400"],
  ["bg-brand-500", "--color-brand-500 · 마커·아이콘"],
  ["bg-brand-600", "--color-brand-600 · 버튼 배경"],
  ["bg-brand-700", "--color-brand-700 · 흰 배경 위 텍스트"],
  ["bg-brand-800", "--color-brand-800"],
  ["bg-brand-900", "--color-brand-900"],
];

const INK = [
  ["bg-ink-50", "--color-ink-50"],
  ["bg-ink-100", "--color-ink-100"],
  ["bg-ink-200", "--color-ink-200 · 경계선"],
  ["bg-ink-300", "--color-ink-300"],
  ["bg-ink-400", "--color-ink-400 · 플레이스홀더"],
  ["bg-ink-500", "--color-ink-500 · 보조 텍스트"],
  ["bg-ink-600", "--color-ink-600"],
  ["bg-ink-700", "--color-ink-700"],
  ["bg-ink-800", "--color-ink-800 · 본문"],
  ["bg-ink-900", "--color-ink-900"],
];

const STATUS = [
  ["bg-star", "--color-star · 별점"],
  ["bg-star-empty", "--color-star-empty"],
  ["bg-success", "--color-success"],
  ["bg-warning", "--color-warning"],
  ["bg-danger", "--color-danger"],
];

const CATEGORY = [
  ["bg-cat-korean", "--color-cat-korean · 한식"],
  ["bg-cat-chinese", "--color-cat-chinese · 중식"],
  ["bg-cat-japanese", "--color-cat-japanese · 일식"],
  ["bg-cat-western", "--color-cat-western · 양식"],
  ["bg-cat-snack", "--color-cat-snack · 분식"],
  ["bg-cat-cafe", "--color-cat-cafe · 카페"],
  ["bg-cat-etc", "--color-cat-etc · 기타"],
];

const SEMANTIC = [
  ["bg-background", "--background"],
  ["bg-foreground", "--foreground"],
  ["bg-primary", "--primary · 주요 버튼"],
  ["bg-secondary", "--secondary"],
  ["bg-muted", "--muted"],
  ["bg-accent", "--accent · hover 배경"],
  ["bg-destructive", "--destructive"],
  ["bg-border", "--border"],
  ["bg-ring", "--ring · 포커스 링"],
];

const TYPE = [
  ["text-display", "--text-display · 28 결과 카드 맛집명"],
  ["text-title", "--text-title · 20 상세 헤더"],
  ["text-subtitle", "--text-subtitle · 17 카드 맛집명"],
  ["text-body", "--text-body · 15 본문"],
  ["text-label", "--text-label · 13 필터칩"],
  ["text-caption", "--text-caption · 12 거리"],
];

const RADIUS = [
  ["rounded-sm", "--radius-sm · 8"],
  ["rounded-md", "--radius-md · 12"],
  ["rounded-lg", "--radius-lg · 16 카드"],
  ["rounded-xl", "--radius-xl · 20 시트"],
  ["rounded-chip", "--radius-chip · 999"],
];

const SHADOW = [
  ["shadow-sheet", "--shadow-sheet"],
  ["shadow-pop", "--shadow-pop"],
  ["shadow-marker", "--shadow-marker"],
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-title">{title}</h2>
        {note && <p className="text-caption text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatches({ items }: { items: string[][] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map(([cls, label]) => (
        <li key={cls} className="flex items-center gap-3">
          <span
            className={`size-9 shrink-0 rounded-md border border-border ${cls}`}
          />
          <span className="min-w-0 break-all text-caption text-muted-foreground">
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DesignPage() {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-10 p-4 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-display">디자인 토큰</h1>
        <p className="text-caption text-muted-foreground">
          개발 전용 화면. 값의 정본은 src/app/globals.css 다.
        </p>
      </header>

      <Section title="Brand" note="brand-500은 대비 3.5:1 — 텍스트 배경 금지">
        <Swatches items={BRAND} />
      </Section>

      <Section title="Ink">
        <Swatches items={INK} />
      </Section>

      <Section title="Status">
        <Swatches items={STATUS} />
      </Section>

      <Section title="Category" note="칩에는 색과 함께 항상 텍스트 라벨을 둔다">
        <Swatches items={CATEGORY} />
      </Section>

      <Section title="Semantic" note="컴포넌트는 가급적 이쪽을 쓴다">
        <Swatches items={SEMANTIC} />
      </Section>

      <Section title="Type scale" note="Pretendard Variable">
        <ul className="flex flex-col gap-3">
          {TYPE.map(([cls, label]) => (
            <li key={cls} className="flex flex-col gap-1">
              <span className={cls}>점심 뭐 먹지 hannuri-matzip 0123</span>
              <span className="text-caption text-muted-foreground">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Radius">
        <ul className="flex flex-col gap-2">
          {RADIUS.map(([cls, label]) => (
            <li key={cls} className="flex items-center gap-3">
              <span
                className={`size-12 shrink-0 border border-border bg-muted ${cls}`}
              />
              <span className="text-caption text-muted-foreground">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Shadow" note="그림자는 떠 있는 것만. 기본은 border 1px">
        <ul className="flex flex-col gap-4">
          {SHADOW.map(([cls, label]) => (
            <li key={cls} className="flex items-center gap-3">
              <span
                className={`size-12 shrink-0 rounded-lg bg-background ${cls}`}
              />
              <span className="text-caption text-muted-foreground">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Rating"
        note="채워진 별 + 숫자 병기. 색만으로 정보를 전달하지 않는다"
      >
        <ul className="flex flex-col gap-3">
          <li className="flex items-center gap-3">
            <Rating value={4.2} count={12} />
            <span className="text-caption text-muted-foreground">
              value=4.2 count=12
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Rating value={5} count={3} />
            <span className="text-caption text-muted-foreground">
              value=5 count=3
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Rating value={2.5} />
            <span className="text-caption text-muted-foreground">
              value=2.5 (count 없음)
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Rating value={0} count={0} />
            <span className="text-caption text-muted-foreground">
              count=0 → 빈 상태
            </span>
          </li>
        </ul>
      </Section>

      <Section
        title="CategoryChip"
        note="Tab으로 이동, Enter/Space로 토글. 선택 시 ✓가 함께 붙는다"
      >
        <ChipDemo />
      </Section>

      <Section title="Distance" note="1000m 미만 340m, 이상 1.2km">
        <ul className="flex flex-col gap-2">
          {[80, 340, 999, 1000, 1234, 15800].map((m) => (
            <li key={m} className="flex items-center gap-3">
              <Distance meters={m} />
              <span className="text-caption text-muted-foreground">
                meters={m}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
