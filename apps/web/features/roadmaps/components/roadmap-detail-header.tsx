import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Pencil, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/features/app-shell/components/page-header";
import type { LearningRoadmap } from "@/features/roadmaps/roadmap.types";
import { RoadmapApplyButton } from "./roadmap-apply-button";

export function RoadmapDetailHeader({ roadmap, nodeCount }: { roadmap: LearningRoadmap; nodeCount: number }) {
  const t = useTranslations("roadmaps");
  const metadata = [
    { label: t("fields.topic"), value: roadmap.topic },
    { label: t("fields.level"), value: `${t(`levels.${roadmap.current_level}`)} - ${t(`levels.${roadmap.target_level}`)}` },
    { label: t("fields.dateRange"), value: `${roadmap.start_date} - ${roadmap.end_date}` },
    { label: t("fields.studyTime"), value: t("studyTime", { days: roadmap.study_days_per_week, minutes: roadmap.minutes_per_study_day }) },
  ];
  return <section className="min-w-0 space-y-card">
    <PageHeader eyebrow={roadmap.subject_name ?? t("title")} title={roadmap.title} description={roadmap.description ?? roadmap.topic}
      action={<>
        <Button variant="outline" size="icon" asChild><Link href="/roadmaps" aria-label={t("back")} title={t("back")}><ArrowLeft aria-hidden="true" /></Link></Button>
        {roadmap.status === "draft" ? <>
          <Button variant="outline" asChild><Link href={`/roadmaps/${roadmap.id}/edit`}><Pencil aria-hidden="true" />{t("edit")}</Link></Button>
          <RoadmapApplyButton roadmapId={roadmap.id} />
        </> : null}
        {roadmap.status === "applied" ? <Button asChild><Link href="/goals"><Target aria-hidden="true" />{t("viewGoals")}</Link></Button> : null}
      </>} />
    <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
      <Badge variant="secondary">{t(`statuses.${roadmap.status}`)}</Badge>
      <span>{t("nodes", { count: nodeCount })}</span><span>{roadmap.preferred_locale.toUpperCase()}</span>
      {roadmap.ai_model ? <span className="min-w-0 [overflow-wrap:anywhere]">{roadmap.ai_provider ?? "AI"} · {roadmap.ai_model}</span> : null}
    </div>
    <dl className="grid min-w-0 grid-cols-2 gap-card border-y border-border py-card lg:grid-cols-4">
      {metadata.map((item) => <div key={item.label} className="min-w-0">
        <dt className="text-caption text-muted-foreground">{item.label}</dt>
        <dd className="mt-1 text-body [overflow-wrap:anywhere]">{item.value}</dd>
      </div>)}
    </dl>
  </section>;
}
