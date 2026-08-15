import { GlobalLeaderboardTable } from "@/features/leaderboard/components/global-leaderboard-table";
import { MyGlobalRankCard } from "@/features/leaderboard/components/my-global-rank-card";
import {
  getGlobalWeeklyLeaderboard,
  getMyGlobalWeeklyRank,
} from "@/features/leaderboard/leaderboard.queries";
import { getLeaderboardSettings } from "@/features/cms-settings/cms-settings.queries";
import { getTranslations } from "next-intl/server";

export default async function LeaderboardPage() {
  const [{ globalLeaderboardEnabled }, t] = await Promise.all([
    getLeaderboardSettings(),
    getTranslations("leaderboard.page"),
  ]);

  if (!globalLeaderboardEnabled) {
    return (
      <main className="space-y-6">
        <section className="rounded-2xl border bg-background p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {t("disabledEyebrow")}
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {t("disabledTitle")}
          </h1>

          <p className="mt-3 max-w-3xl text-muted-foreground">
            {t("disabledDescription")}
          </p>
        </section>
      </main>
    );
  }

  const [leaderboard, myRank] = await Promise.all([
    getGlobalWeeklyLeaderboard(),
    getMyGlobalWeeklyRank(),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {t("description")}
        </p>
      </section>

      <MyGlobalRankCard rank={myRank} />

      <GlobalLeaderboardTable
        weekStart={leaderboard.weekStart}
        weekEnd={leaderboard.weekEnd}
        rows={leaderboard.rows}
      />
    </main>
  );
}
