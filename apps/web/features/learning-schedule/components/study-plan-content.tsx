import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getStudyPlanAction } from "../study-plan.queries.actions";
import { StudyPlanOverview } from "./study-plan-overview";
import { StudyCalendar } from "./study-calendar";
import { TodaysStudyPlan } from "./todays-study-plan";
import { isFocusV2CreationEnabled } from "@/features/focus-sessions/focus-v2-release";
import { getStudyFocusEffortAction } from "../study-focus-effort.queries.actions";
import type { StudyPlanDisplaySession, StudyPlanSession } from "../study-plan-projection";
import { studyPlanTiming } from "../study-plan-timing";

export async function StudyPlanContent({ month }: { month: string }) {
  const [result, t] = await Promise.all([getStudyPlanAction({ month }), getTranslations("studyPlan")]);
  if (!result.success) return <div role="alert" className="rounded-lg border border-border p-5">
    <p>{t(`error.${result.code}`)}</p><Link href="/study-plan" className="mt-3 inline-block underline">{t("retry")}</Link>
  </div>;
  const focusEnabled = isFocusV2CreationEnabled();
  const studySessionIds = [...new Set([
    ...result.today.map(row => row.id),
    ...result.calendar.flatMap(day => day.sessions.map(row => row.id)),
  ])];
  const effort = await getStudyFocusEffortAction({ studySessionIds });
  const timing = studyPlanTiming("renderPreparation");
  const byId = new Map(effort.success ? effort.efforts.map(row => [row.studySessionId, row]) : []);
  const withEffort = (rows: StudyPlanSession[]): StudyPlanDisplaySession[] => rows.map(row => {
    const { id, taskId, taskTitle, localDate, localStartTime, localEndTime, timezone, status, plannedMinutes, canLaunchFocus } = row;
    const focus = byId.get(id);
    return { id, taskId, taskTitle, localDate, localStartTime, localEndTime, timezone, status, plannedMinutes, canLaunchFocus,
      recordedFocus: focus && { recordedMinutes: focus.recordedMinutes, hasActiveFocus: focus.hasActiveFocus } };
  });
  const today = withEffort(result.today);
  const calendar = result.calendar.map(day => ({ ...day, sessions: withEffort(day.sessions) }));
  timing.mark("prepare");
  timing.finish();
  return <div className="space-y-6">
    <StudyPlanOverview summary={result.summary} />
    {effort.success
      ? <p className="text-sm text-secondary-text">{t("focusEffort.hint")}</p>
      : <p role="status" className="text-sm text-secondary-text">{t("focusEffort.unavailable")}</p>}
    <TodaysStudyPlan sessions={today} focusEnabled={focusEnabled} />
    <StudyCalendar month={month} days={calendar} focusEnabled={focusEnabled} />
    <p className="text-xs text-secondary-text">{t("asOf", { instant: result.asOf })}</p>
  </div>;
}
