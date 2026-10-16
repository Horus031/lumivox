import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className="min-w-0">
      {eyebrow ? (
        <p className="mb-1 text-caption font-medium text-muted-foreground [overflow-wrap:anywhere]">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-section gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-page font-semibold tracking-normal text-foreground [overflow-wrap:anywhere]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-body text-secondary-text [overflow-wrap:anywhere]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div data-slot="page-header-actions" className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&>*]:max-w-full">
            {action}
          </div>
        ) : null}
      </div>
    </header>
  );
}
