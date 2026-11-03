import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getStudyPlanAction } from "../study-plan.queries.actions";
import { StudyPlanOverview } from "./study-plan-overview";
import { StudyCalendar } from "./study-calendar";
import { TodaysStudyPlan } from "./todays-study-plan";

export async function StudyPlanContent({ month }: { month: string }) {
  const [result, t] = await Promise.all([getStudyPlanAction({ month }), getTranslations("studyPlan")]);
  if (!result.success) return <div role="alert" className="rounded-lg border border-border p-5">
    <p>{t(`error.${result.code}`)}</p><Link href="/study-plan" className="mt-3 inline-block underline">{t("retry")}</Link>
  </div>;
  return <div className="space-y-6">
    <StudyPlanOverview summary={result.summary} />
    <TodaysStudyPlan sessions={result.today} />
    <StudyCalendar month={month} days={result.calendar} />
    <p className="text-xs text-secondary-text">{t("asOf", { instant: result.asOf })}</p>
  </div>;
}
