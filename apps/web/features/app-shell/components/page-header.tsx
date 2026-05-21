import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="rounded-[30px] p-5 ring-1 ring-border/60 shadow-[0_16px_50px_-40px_hsl(var(--primary)/0.22)] md:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          <span className="rounded-full bg-muted/70 px-3 py-1 text-foreground/80">
            {eyebrow}
          </span>
          <span className="rounded-full bg-muted/50 px-3 py-1">
            Study workspace
          </span>
        </div>

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-4xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              {description}
            </p>
          </div>

          {action ? (
            <div>
              {action}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}