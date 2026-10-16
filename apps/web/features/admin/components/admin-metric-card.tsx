type AdminMetricCardProps = {
  label: string;
  value: number | string;
  description?: string;
};

export function AdminMetricCard({
  label,
  value,
  description,
}: AdminMetricCardProps) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-card [overflow-wrap:anywhere]">
      <p className="text-label font-medium text-secondary-text">
        {label}
      </p>

      <p className="mt-2 text-metric font-semibold tabular-nums text-foreground">
        {value}
      </p>

      {description ? (
        <p className="mt-1 text-caption text-muted-foreground">
          {description}
        </p>
      ) : null}
    </article>
  );
}
