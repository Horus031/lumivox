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
  if (rank === 1) return "\u{1f947}";
  if (rank === 2) return "\u{1f948}";
  if (rank === 3) return "\u{1f949}";
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
    <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {t("eyebrow")}
          </p>

          <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
            {t("title")}
          </h2>

          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {dateFormatter.format(new Date(weekStart))} -{" "}
            {dateFormatter.format(new Date(weekEnd))}
          </p>
        </div>

        <p className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          {t("scoreFormula")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed p-8 text-center dark:border-neutral-800">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3 font-semibold text-neutral-700 dark:text-neutral-300">
                  {t("columns.rank")}
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-700 dark:text-neutral-300">
                  {t("columns.member")}
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-700 dark:text-neutral-300">
                  {t("columns.focus")}
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-700 dark:text-neutral-300">
                  {t("columns.tasks")}
                </th>
                <th className="px-4 py-3 font-semibold text-neutral-700 dark:text-neutral-300">
                  {t("columns.score")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y dark:divide-neutral-800">
              {rows.map((row) => (
                <tr key={row.user_id}>
                  <td className="px-4 py-3 font-semibold text-neutral-950 dark:text-neutral-50">
                    {getRankLabel(row.rank_position)}
                  </td>

                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-950 dark:text-neutral-50">
                      {displayUser(row)}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {t(`roles.${row.role}`)}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                    {t("minutes", { count: row.focus_minutes })}
                  </td>

                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                    {row.completed_tasks}
                  </td>

                  <td className="px-4 py-3 font-bold text-neutral-950 dark:text-neutral-50">
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
