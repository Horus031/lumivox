import { getRecentFocusSessions } from "@/features/focus-sessions/focus-session.queries";
import { RecentFocusSessions } from "@/features/focus-sessions/components/recent-focus-sessions";
import { FocusV2AnalyticsDashboard } from "@/features/focus-sessions/components/focus-v2-analytics-dashboard";

export async function FocusOverview({ days }: { days: 7 | 30 }) {
  const sessions = await getRecentFocusSessions();
  const recent = <RecentFocusSessions sessions={sessions} embedded />;

  return process.env.FOCUS_V2_ENABLED === "true"
    ? <FocusV2AnalyticsDashboard days={days} recentSessions={recent} />
    : <RecentFocusSessions sessions={sessions} />;
}
