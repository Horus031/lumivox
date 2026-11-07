"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { StudyPlanSession } from "../study-plan-projection";

type Props = { sessions: StudyPlanSession[]; focusEnabled?: boolean };

export function StudyPlanSessions({ sessions, focusEnabled }: Props) {
  const t = useTranslations("studyPlan");
  return <ul className="divide-y divide-border">{sessions.map(row => <li key={row.id} data-study-session={row.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
    <div className="min-w-0 space-y-1">
      <Link className="break-words font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
        href={{ pathname: "/workspace", query: { task: row.taskId } }}>{row.taskTitle}</Link>
      <p className="break-words text-sm text-secondary-text"><time dateTime={row.localDate}>{row.localDate}</time>{" · "}
        {row.localStartTime.slice(0, 5)}–{row.localEndTime.slice(0, 5)}{" · "}{row.timezone}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{t(`status.${row.status}`)}</Badge>
      {focusEnabled && row.canLaunchFocus && (
        <Link className={buttonVariants({ variant: "outline", size: "sm" })}
          href={{ pathname: "/focus", query: { studySession: row.id } }}>{t("focusLaunch.start")}</Link>
      )}
    </div>
  </li>)}</ul>;
}
export function TodaysStudyPlan({ sessions, focusEnabled }: Props) {
  const t = useTranslations("studyPlan");
  return <Card className="p-5" data-testid="todays-study-plan">
    <section aria-labelledby="todays-study-heading">
      <h2 id="todays-study-heading" className="text-xl font-semibold">{t("todayTitle")}</h2>
      <p className="mt-2 text-sm text-secondary-text">{t("timezoneHint")}</p>
      {sessions.length ? <StudyPlanSessions sessions={sessions} focusEnabled={focusEnabled} /> : <p className="py-6 text-secondary-text">{t("todayEmpty")}</p>}
    </section>
  </Card>;
}
