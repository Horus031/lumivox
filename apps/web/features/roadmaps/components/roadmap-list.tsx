import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LearningRoadmapListItem } from "@/features/roadmaps/roadmap.types";

export function RoadmapList({ roadmaps }: { roadmaps: LearningRoadmapListItem[] }) {
  const t = useTranslations("roadmaps");
  if (!roadmaps.length) {
    return <section className="border-y border-border py-section">
      <h2 className="text-section font-semibold">{t("emptyTitle")}</h2>
      <p className="mt-1 text-body text-secondary-text">{t("emptyDescription")}</p>
      <Button asChild className="mt-4"><Link href="/roadmaps/new"><Plus aria-hidden="true" />{t("create")}</Link></Button>
    </section>;
  }
  return <section className="grid min-w-0 gap-card md:grid-cols-2 2xl:grid-cols-3">
    {roadmaps.map((roadmap) => (
      <Link key={roadmap.id} href={`/roadmaps/${roadmap.id}`}
        className="min-w-0 rounded-lg border border-border bg-card p-card transition-colors hover:border-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-caption text-muted-foreground [overflow-wrap:anywhere]">{roadmap.subject_name ?? t("fallbackTitle")}</p>
          <Badge variant="secondary">{t(`statuses.${roadmap.status}`)}</Badge>
        </div>
        <h2 className="mt-2 text-section font-semibold line-clamp-2 [overflow-wrap:anywhere]" title={roadmap.title}>{roadmap.title}</h2>
        <p className="mt-1 text-body text-secondary-text line-clamp-2 [overflow-wrap:anywhere]">{roadmap.description ?? roadmap.topic}</p>
        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-caption">
          <div><dt className="text-muted-foreground">{t("fields.dateRange")}</dt><dd className="mt-0.5 text-foreground">{roadmap.start_date} - {roadmap.end_date}</dd></div>
          <div><dt className="text-muted-foreground">{t("fields.studyTime")}</dt><dd className="mt-0.5 text-foreground">{t("studyTime", { days: roadmap.study_days_per_week, minutes: roadmap.minutes_per_study_day })}</dd></div>
        </dl>
      </Link>
    ))}
  </section>;
}
