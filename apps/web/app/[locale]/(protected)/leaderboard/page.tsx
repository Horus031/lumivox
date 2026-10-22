import { GlobalLeaderboardTable } from "@/features/leaderboard/components/global-leaderboard-table";
import { MyGlobalRankCard } from "@/features/leaderboard/components/my-global-rank-card";
import { getGlobalWeeklyLeaderboardBundle } from "@/features/leaderboard/leaderboard.queries";
import { getLeaderboardSettings } from "@/features/cms-settings/cms-settings.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

export default async function LeaderboardPage() {
  const [{ globalLeaderboardEnabled }, t] = await Promise.all([
    getLeaderboardSettings(),
    getTranslations("leaderboard.page"),
  ]);

  if (!globalLeaderboardEnabled) {
    return (
      <div className="min-w-0 space-y-section">
        <PageHeader eyebrow={t("disabledEyebrow")} title={t("disabledTitle")} description={t("disabledDescription")} />
      </div>
    );
  }

  const leaderboard = await getGlobalWeeklyLeaderboardBundle();

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <MyGlobalRankCard rank={leaderboard.myRank} />

      <GlobalLeaderboardTable
        weekStart={leaderboard.weekStart}
        weekEnd={leaderboard.weekEnd}
        rows={leaderboard.rows}
      />
    </div>
  );
}
