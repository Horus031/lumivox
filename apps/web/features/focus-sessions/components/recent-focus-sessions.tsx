"use client";

import type { RecentFocusSessionWithTask } from "@/features/focus-sessions/focus-session.types";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

type RecentFocusSessionsProps = {
  sessions: RecentFocusSessionWithTask[];
  embedded?: boolean;
};

export function RecentFocusSessions({ sessions, embedded = false }: RecentFocusSessionsProps) {
  const t = useTranslations("focus.recent");

  return (
    <section className={embedded ? "min-w-0" : "min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"}>
      <div>
        <h2 className="text-label font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>

      {sessions.length === 0 ? (
        <div className="pt-4">
          <h3 className="text-label font-medium">{t("emptyTitle")}</h3>
          <p className="mt-1 text-body text-secondary-text">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="mt-3 max-h-64 divide-y divide-border overflow-y-auto pr-1">
          {sessions.map((session) => (
            <article key={session.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 basis-32 text-label font-medium [overflow-wrap:anywhere]">
                  {session.tasks?.title ?? t("generalSession")}
                </h3>

                <Badge variant="secondary" className="shrink-0">
                  {t(`status.${session.status}`)}
                </Badge>
              </div>
              <p className="mt-1 text-caption text-muted-foreground">
                {t("sessionMetrics", {
                  planned: session.planned_minutes,
                  actual: session.actual_focus_minutes,
                })}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
