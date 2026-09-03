import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { useTranslations } from "next-intl";

type RoadmapMetrics = {
  total_roadmaps: number;
  draft_roadmaps: number;
  applied_roadmaps: number;
  archived_roadmaps: number;
  total_roadmap_nodes: number;
  total_goal_nodes: number;
  total_task_nodes: number;
  total_subtask_nodes: number;
};

type AdminRoadmapMetricsOverviewProps = {
  metrics: RoadmapMetrics | null;
};

function value(input: number | null | undefined) {
  return input ?? 0;
}

export function AdminRoadmapMetricsOverview({
  metrics,
}: AdminRoadmapMetricsOverviewProps) {
  const t = useTranslations("admin.roadmaps.metrics");

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AdminMetricCard
        label={t("totalRoadmaps")}
        value={value(metrics?.total_roadmaps)}
        description={t("totalRoadmapsDescription")}
      />

      <AdminMetricCard
        label={t("draft")}
        value={value(metrics?.draft_roadmaps)}
        description={t("draftDescription")}
      />

      <AdminMetricCard
        label={t("applied")}
        value={value(metrics?.applied_roadmaps)}
        description={t("appliedDescription")}
      />

      <AdminMetricCard
        label={t("nodes")}
        value={value(metrics?.total_roadmap_nodes)}
        description={t("nodesDescription", {
          goals: value(metrics?.total_goal_nodes),
          tasks: value(metrics?.total_task_nodes),
          subtasks: value(metrics?.total_subtask_nodes),
        })}
      />
    </section>
  );
}
