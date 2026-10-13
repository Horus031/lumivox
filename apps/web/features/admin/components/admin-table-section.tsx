import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  empty: boolean;
  emptyMessage: string;
  className?: string;
  children: ReactNode;
};

export function AdminTableSection({ title, empty, emptyMessage, className, children }: Props) {
  const titleId = useId();
  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <h2 id={titleId} className="text-section font-semibold text-foreground">{title}</h2>
      {empty ? <p className="py-section text-body text-muted-foreground">{emptyMessage}</p> : (
        <div role="region" aria-labelledby={titleId} tabIndex={0} className="max-w-full overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className={cn("w-full text-left text-body [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_td]:px-3 [&_td]:py-3 [&_td]:align-top", className)}>
            <caption className="sr-only">{title}</caption>
            {children}
          </table>
        </div>
      )}
    </section>
  );
}
