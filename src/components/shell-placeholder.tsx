// 0.6에서 <Modal>(모바일 Sheet / 데스크톱 Dialog) 와 <PageShell> 로 교체된다.
// 지금은 인터셉트 경로와 풀페이지 경로가 서로 다르게 그려지는지만 눈으로 확인하는 용도.

export function ModalPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-end justify-center lg:items-center">
      <div className="w-full max-w-[560px] rounded-t-xl border bg-white p-6 lg:rounded-lg">
        {children}
      </div>
    </div>
  );
}

export function PagePlaceholder({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh p-6">{children}</main>;
}
