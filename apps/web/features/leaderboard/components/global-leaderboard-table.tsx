import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";

type GlobalLeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  focus_minutes: number;
  completed_tasks: number;
  focus_sessions: number;
  current_streak: number;
  score: number;
  rank_position: number;
};

type GlobalLeaderboardTableProps = {
  weekStart: string;
  weekEnd: string;
  rows: GlobalLeaderboardRow[];
};

export function GlobalLeaderboardTable({
  weekStart,
  weekEnd,
  rows,
}: GlobalLeaderboardTableProps) {
  const locale = useLocale();
  const titleId = useId();
  const t = useTranslations("leaderboard.table");
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption text-muted-foreground">
            {t("eyebrow")}
          </p>

          <h2 id={titleId} className="mt-1 text-section font-semibold text-foreground">
            {t("title")}
          </h2>

          <p className="mt-1 text-caption text-muted-foreground">
            {dateFormatter.format(new Date(weekStart))} -{" "}
            {dateFormatter.format(new Date(weekEnd))}
          </p>
        </div>

        <p className="max-w-full text-caption text-secondary-text [overflow-wrap:anywhere]">
          {t("scoreFormula")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="py-section">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div role="region" aria-labelledby={titleId} tabIndex={0} className="max-w-full overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="min-w-180 w-full text-left text-body"><caption className="sr-only">{t("title")}</caption>
            <thead className="border-b border-border bg-muted text-label text-secondary-text">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.rank")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.learner")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.focus")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.tasks")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.sessions")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.streak")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("columns.score")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td className="px-3 py-3 font-medium tabular-nums text-secondary-text">
                    #{row.rank_position}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {row.avatar_url && (
                        <Image
                          src={row.avatar_url}
                          width={32}
                          height={32}
                          unoptimized
                          alt=""
                          className="size-8 shrink-0 rounded-full object-cover"
                        />
                      )}

                      <p className="min-w-0 max-w-60 font-medium text-foreground [overflow-wrap:anywhere]">
                        {row.display_name}
                      </p>
                    </div>
                  </td>

                  <td className="px-3 py-3 tabular-nums text-secondary-text">
                    {t("minutes", { count: row.focus_minutes })}
                  </td>

                  <td className="px-3 py-3 tabular-nums text-secondary-text">
                    {row.completed_tasks}
                  </td>

                  <td className="px-3 py-3 tabular-nums text-secondary-text">
                    {row.focus_sessions}
                  </td>

                  <td className="px-3 py-3 tabular-nums text-secondary-text">
                    {t("days", { count: row.current_streak })}
                  </td>

                  <td className="px-3 py-3 font-semibold tabular-nums text-foreground">
                    {row.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
