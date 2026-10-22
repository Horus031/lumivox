export function PageLoading({ label }: { label: string }) {
  return (
    <section role="status" aria-busy="true" aria-label={label} className="min-w-0 space-y-section">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="min-w-0 space-y-section motion-reduce:[&_*]:animate-none">
        <div className="space-y-2"><div className="h-8 w-56 max-w-full animate-pulse rounded-md bg-muted" /><div className="h-4 w-96 max-w-full animate-pulse rounded-sm bg-muted" /></div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="h-24 animate-pulse rounded-lg border border-border bg-muted" />)}</div>
        <div className="divide-y divide-border border-t border-border">{[0, 1, 2].map((key) => <div key={key} className="space-y-3 py-card"><div className="h-5 w-64 max-w-full animate-pulse rounded-sm bg-muted" /><div className="h-4 w-full animate-pulse rounded-sm bg-muted" /><div className="h-4 w-3/4 animate-pulse rounded-sm bg-muted" /></div>)}</div>
      </div>
    </section>
  );
}
