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
    <article className="rounded-2xl border bg-surface p-5 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold text-foreground">
        {value}
      </p>

      {description ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </article>
  );
}