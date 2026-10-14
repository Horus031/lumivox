import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

import { AdminRoadmapArchiveButton } from "@/features/admin/components/admin-roadmap-archive-button";

type AdminRoadmap = {
  roadmap_id: string;
  user_id: string;
  owner_name: string | null;
  owner_email: string | null;

  title: string;
  topic: string;
  subject_name: string | null;
  description: string | null;

  current_level: string;
  target_level: string;
  start_date: string;
  end_date: string;
  study_days_per_week: number;
  minutes_per_study_day: number;
  preferred_locale: string;
  status: string;

  goal_nodes: number;
  task_nodes: number;
  subtask_nodes: number;
  total_nodes: number;

  ai_provider: string | null;
  ai_model: string | null;
  ai_latency_ms: number | null;

  applied_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminRoadmapsTableProps = {
  roadmaps: AdminRoadmap[];
};

function statusClass(status: string) {
  if (status === "applied") {
    return "border-success/25 bg-success/10 text-foreground";
  }

  if (status === "archived") {
    return "border-border bg-muted text-foreground";
  }

  return "border-warning/25 bg-warning/10 text-foreground";
}

export function AdminRoadmapsTable({ roadmaps }: AdminRoadmapsTableProps) {
  const t = useTranslations("admin.roadmaps.table");
  const commonT = useTranslations("admin.common");

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <div>
        <p className="text-caption text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-1 text-section font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>

      {roadmaps.length === 0 ? (
        <div className="py-section">
          <p className="text-body text-secondary-text">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {roadmaps.map((roadmap) => (
            <article
              key={roadmap.roadmap_id}
              className="min-w-0 py-card"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={statusClass(roadmap.status)}>
                      {t(`statuses.${roadmap.status}`)}
                    </Badge>

                    <span className="text-caption text-muted-foreground">
                      {roadmap.preferred_locale.toUpperCase()}
                    </span>

                    <span className="text-caption text-muted-foreground">
                      {t("nodesCount", { count: roadmap.total_nodes })}
                    </span>
                  </div>

                  <h3 className="mt-2 text-section font-semibold text-foreground">
                    {roadmap.title}
                  </h3>

                  <p className="mt-1 text-body text-secondary-text">
                    {roadmap.topic}
                  </p>

                  <p className="mt-3 text-caption text-muted-foreground">
                    {t("owner", {
                      name: roadmap.owner_name ?? commonT("unknownOwner"),
                    })} ·{" "}
                    {roadmap.owner_email ?? roadmap.user_id}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {t("nodeBreakdown", {
                      goals: roadmap.goal_nodes,
                      tasks: roadmap.task_nodes,
                      subtasks: roadmap.subtask_nodes,
                    })}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {t("studyPlan", {
                      start: roadmap.start_date,
                      end: roadmap.end_date,
                      days: roadmap.study_days_per_week,
                      minutes: roadmap.minutes_per_study_day,
                    })}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {t("aiMeta", {
                      provider: roadmap.ai_provider ?? commonT("na"),
                      model: roadmap.ai_model ?? commonT("na"),
                      latency: roadmap.ai_latency_ms
                        ? t("latencyMs", { count: roadmap.ai_latency_ms })
                        : commonT("na"),
                    })}
                  </p>
                </div>

                <AdminRoadmapArchiveButton
                  roadmapId={roadmap.roadmap_id}
                  status={roadmap.status}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
