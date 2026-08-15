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

function getRankLabel(rank: number) {
  if (rank === 1) return "\u{1f947}";
  if (rank === 2) return "\u{1f948}";
  if (rank === 3) return "\u{1f949}";
  return `#${rank}`;
}

export function GlobalLeaderboardTable({
  weekStart,
  weekEnd,
  rows,
}: GlobalLeaderboardTableProps) {
  const locale = useLocale();
  const t = useTranslations("leaderboard.table");
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t("eyebrow")}
          </p>

          <h2 className="mt-2 text-2xl font-bold text-foreground">
            {t("title")}
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            {dateFormatter.format(new Date(weekStart))} -{" "}
            {dateFormatter.format(new Date(weekEnd))}
          </p>
        </div>

        <p className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-foreground">
          {t("scoreFormula")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-background text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.rank")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.learner")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.focus")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.tasks")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.sessions")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.streak")}
                </th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">
                  {t("columns.score")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-neutral-800">
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td className="px-4 py-3 font-bold text-muted-foreground">
                    {getRankLabel(row.rank_position)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.avatar_url && (
                        <Image
                          src={row.avatar_url}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      )}

                      <p className="font-medium text-foreground">
                        {row.display_name}
                      </p>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {t("minutes", { count: row.focus_minutes })}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {row.completed_tasks}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {row.focus_sessions}
                  </td>

                  <td className="px-4 py-3 text-foreground">
                    {t("days", { count: row.current_streak })}
                  </td>

                  <td className="px-4 py-3 font-bold text-foreground">
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
