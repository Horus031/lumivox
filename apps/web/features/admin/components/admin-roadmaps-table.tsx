import { useTranslations } from "next-intl";

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
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (status === "archived") {
    return "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300";
  }

  return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
}

export function AdminRoadmapsTable({ roadmaps }: AdminRoadmapsTableProps) {
  const t = useTranslations("admin.roadmaps.table");
  const commonT = useTranslations("admin.common");

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          {t("title")}
        </h2>
      </div>

      {roadmaps.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center dark:border-neutral-800">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {roadmaps.map((roadmap) => (
            <article
              key={roadmap.roadmap_id}
              className="rounded-2xl border p-4 dark:border-neutral-800"
            >
              <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                        roadmap.status
                      )}`}
                    >
                      {t(`statuses.${roadmap.status}`)}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {roadmap.preferred_locale.toUpperCase()}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {t("nodesCount", { count: roadmap.total_nodes })}
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-neutral-950 dark:text-neutral-50">
                    {roadmap.title}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {roadmap.topic}
                  </p>

                  <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("owner", {
                      name: roadmap.owner_name ?? commonT("unknownOwner"),
                    })} ·{" "}
                    {roadmap.owner_email ?? roadmap.user_id}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("nodeBreakdown", {
                      goals: roadmap.goal_nodes,
                      tasks: roadmap.task_nodes,
                      subtasks: roadmap.subtask_nodes,
                    })}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("studyPlan", {
                      start: roadmap.start_date,
                      end: roadmap.end_date,
                      days: roadmap.study_days_per_week,
                      minutes: roadmap.minutes_per_study_day,
                    })}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
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
