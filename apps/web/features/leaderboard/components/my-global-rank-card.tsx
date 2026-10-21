import { useTranslations } from "next-intl";

type MyGlobalRank = {
  user_id: string;
  display_name: string;
  focus_minutes: number;
  completed_tasks: number;
  focus_sessions: number;
  current_streak: number;
  score: number;
  rank_position: number;
};

type MyGlobalRankCardProps = {
  rank: MyGlobalRank | null;
};

export function MyGlobalRankCard({ rank }: MyGlobalRankCardProps) {
  const t = useTranslations("leaderboard.myRankCard");

  if (!rank) {
    return (
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-foreground">
          {t("notRanked")}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {t("notRankedDescription")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {t("eyebrow")}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-5">
        <div>
          <p className="text-xs text-muted-foreground">
            {t("labels.rank")}
          </p>
          <p className="mt-1 text-3xl font-bold text-neutral-950 dark:text-neutral-50">
            #{rank.rank_position}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            {t("labels.score")}
          </p>
          <p className="mt-1 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
            {rank.score}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            {t("labels.focus")}
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-950 dark:text-neutral-50">
            {t("minutes", { count: rank.focus_minutes })}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            {t("labels.tasks")}
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-950 dark:text-neutral-50">
            {rank.completed_tasks}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            {t("labels.sessions")}
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-950 dark:text-neutral-50">
            {rank.focus_sessions}
          </p>
        </div>
      </div>
    </section>
  );
}
