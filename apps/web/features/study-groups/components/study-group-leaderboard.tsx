import { useLocale, useTranslations } from "next-intl";

type LeaderboardRow = {
  user_id: string;
  email: string | null;
  role: string;
  focus_minutes: number;
  completed_tasks: number;
  score: number;
  rank_position: number;
};

type StudyGroupLeaderboardProps = {
  weekStart: string;
  weekEnd: string;
  rows: LeaderboardRow[];
};

function displayUser(row: LeaderboardRow) {
  return row.email || `User ${row.user_id.slice(0, 8)}`;
}

function getRankLabel(rank: number) {
  return `#${rank}`;
}

export function StudyGroupLeaderboard({
  weekStart,
  weekEnd,
  rows,
}: StudyGroupLeaderboardProps) {
  const locale = useLocale();
  const t = useTranslations("groups.leaderboardPanel");
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });

  return (
    <section className="min-w-0 border-t border-border pt-card">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-caption font-medium text-muted-foreground">
            {t("eyebrow")}
          </p>

          <h2 className="mt-2 text-section font-semibold text-foreground">
            {t("title")}
          </h2>

          <p className="mt-2 text-body text-secondary-text">
            {dateFormatter.format(new Date(weekStart))} -{" "}
            {dateFormatter.format(new Date(weekEnd))}
          </p>
        </div>

        <p className="text-caption text-muted-foreground">
          {t("scoreFormula")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 border-t border-border py-card text-center">
          <p className="text-body text-secondary-text">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-card min-w-0 overflow-x-auto" tabIndex={0} aria-label={t("title")}>
          <table className="w-full min-w-120 text-body">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2 text-label font-medium text-secondary-text">
                  {t("columns.rank")}
                </th>
                <th className="px-3 py-2 text-label font-medium text-secondary-text">
                  {t("columns.member")}
                </th>
                <th className="px-3 py-2 text-label font-medium text-secondary-text">
                  {t("columns.focus")}
                </th>
                <th className="px-3 py-2 text-label font-medium text-secondary-text">
                  {t("columns.tasks")}
                </th>
                <th className="px-3 py-2 text-label font-medium text-secondary-text">
                  {t("columns.score")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td className="px-3 py-3 font-medium text-foreground">
                    {getRankLabel(row.rank_position)}
                  </td>

                  <td className="px-3 py-3">
                    <p className="max-w-48 font-medium text-foreground [overflow-wrap:anywhere]">
                      {displayUser(row)}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {t(`roles.${row.role}`)}
                    </p>
                  </td>

                  <td className="px-3 py-3 text-secondary-text">
                    {t("minutes", { count: row.focus_minutes })}
                  </td>

                  <td className="px-3 py-3 text-secondary-text">
                    {row.completed_tasks}
                  </td>

                  <td className="px-3 py-3 font-semibold text-foreground">
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
