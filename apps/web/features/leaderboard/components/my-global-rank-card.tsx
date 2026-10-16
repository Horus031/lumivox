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
      <section className="min-w-0 space-y-3 border-t border-border pt-card">
        <p className="text-caption text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-1 text-section font-semibold text-foreground">
          {t("notRanked")}
        </h2>

        <p className="mt-1 text-body text-secondary-text">
          {t("notRankedDescription")}
        </p>
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <p className="text-caption text-muted-foreground">
        {t("eyebrow")}
      </p>

      <div className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-5 [&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere]">
        <div>
          <p className="text-caption text-muted-foreground">
            {t("labels.rank")}
          </p>
          <p className="mt-1 text-section font-semibold tabular-nums text-foreground">
            #{rank.rank_position}
          </p>
        </div>

        <div>
          <p className="text-caption text-muted-foreground">
            {t("labels.score")}
          </p>
          <p className="mt-1 text-section font-semibold tabular-nums text-foreground">
            {rank.score}
          </p>
        </div>

        <div>
          <p className="text-caption text-muted-foreground">
            {t("labels.focus")}
          </p>
          <p className="mt-1 text-section font-semibold tabular-nums text-foreground">
            {t("minutes", { count: rank.focus_minutes })}
          </p>
        </div>

        <div>
          <p className="text-caption text-muted-foreground">
            {t("labels.tasks")}
          </p>
          <p className="mt-1 text-section font-semibold tabular-nums text-foreground">
            {rank.completed_tasks}
          </p>
        </div>

        <div>
          <p className="text-caption text-muted-foreground">
            {t("labels.sessions")}
          </p>
          <p className="mt-1 text-section font-semibold tabular-nums text-foreground">
            {rank.focus_sessions}
          </p>
        </div>
      </div>
    </section>
  );
}
