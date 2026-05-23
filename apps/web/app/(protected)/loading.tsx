function LoadingBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-card/75 ${className}`} />;
}

function LoadingLine({ className }: { className?: string }) {
  return (
    <div
      className={`h-4 animate-pulse rounded-full bg-muted/75 ${className ?? ""}`}
    />
  );
}

export default function ProtectedLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading page"
      className="relative overflow-hidden px-4 py-6 md:px-6 lg:px-8 lg:py-8 xl:px-0"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_32%),radial-gradient(circle_at_top_right,hsl(var(--primary-glow)/0.08),transparent_24%)]" />

      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="rounded-[30px] border border-border/60 bg-card/70 p-5 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.22)] backdrop-blur-sm md:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.24em]">
            <div className="h-7 w-20 animate-pulse rounded-full bg-muted/75" />
            <div className="h-7 w-28 animate-pulse rounded-full bg-muted/55" />
          </div>

          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-3">
              <LoadingBlock className="h-8 w-44" />
              <LoadingLine className="w-full max-w-3xl" />
              <LoadingLine className="w-5/6 max-w-2xl" />
            </div>

            <LoadingBlock className="h-11 w-full max-w-44 rounded-2xl md:w-44" />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
          <div className="space-y-6">
            <div className="rounded-[30px] border border-border/60 bg-card/70 p-5 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.22)] md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <LoadingBlock className="h-6 w-32" />
                  <LoadingLine className="w-48" />
                </div>
                <LoadingBlock className="h-10 w-28 rounded-2xl" />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <LoadingBlock className="h-28" />
                <LoadingBlock className="h-28" />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`primary-skeleton-${index}`}
                  className="rounded-[28px] border border-border/60 bg-card/70 p-5 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.22)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <LoadingBlock className="h-4 w-24 rounded-full" />
                      <LoadingBlock className="h-6 w-3/4" />
                    </div>
                    <LoadingBlock className="h-9 w-9 rounded-2xl" />
                  </div>

                  <div className="mt-5 space-y-3">
                    <LoadingLine className="w-full" />
                    <LoadingLine className="w-11/12" />
                    <LoadingLine className="w-4/5" />
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <LoadingBlock className="h-3 flex-1 rounded-full" />
                    <LoadingBlock className="h-3 w-12 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[30px] border border-border/60 bg-card/70 p-5 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.22)] md:p-6">
              <LoadingBlock className="h-6 w-40" />
              <div className="mt-5 space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`secondary-skeleton-${index}`}
                    className="rounded-3xl border border-border/50 bg-background/60 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <LoadingBlock className="h-11 w-11 rounded-2xl" />
                      <div className="flex-1 space-y-2">
                        <LoadingLine className="w-28" />
                        <LoadingLine className="w-40" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-border/60 bg-card/70 p-5 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.22)] md:p-6">
              <LoadingBlock className="h-6 w-32" />
              <div className="mt-5 grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`metric-skeleton-${index}`}
                    className="rounded-[22px] border border-border/50 bg-background/60 p-4"
                  >
                    <LoadingLine className="w-16" />
                    <LoadingBlock className="mt-3 h-8 w-20" />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}