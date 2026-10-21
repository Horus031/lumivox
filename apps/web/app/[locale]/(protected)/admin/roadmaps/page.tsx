import { AdminRoadmapMetricsOverview } from "@/features/admin/components/admin-roadmap-metrics-overview";
import { AdminRoadmapSearchForm } from "@/features/admin/components/admin-roadmap-search-form";
import { AdminRoadmapsTable } from "@/features/admin/components/admin-roadmaps-table";
import {
  getAdminRoadmapMetrics,
  searchAdminLearningRoadmaps,
} from "@/features/admin/admin-roadmaps.queries";
import { getTranslations } from "next-intl/server";

type AdminRoadmapsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

export default async function AdminRoadmapsPage({
  searchParams,
}: AdminRoadmapsPageProps) {
  const { q, status } = await searchParams;

  const query = q ?? "";
  const roadmapStatus = status ?? "all";

  const [metrics, roadmaps, t] = await Promise.all([
    getAdminRoadmapMetrics(),
    searchAdminLearningRoadmaps({
      query,
      status: roadmapStatus,
    }),
    getTranslations("admin.roadmaps.page"),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          {t("title")}
        </h1>

        <p className="mt-3 max-w-3xl text-neutral-600 dark:text-neutral-400">
          {t("description")}
        </p>
      </section>

      <AdminRoadmapMetricsOverview metrics={metrics} />

      <AdminRoadmapSearchForm
        initialQuery={query}
        initialStatus={roadmapStatus}
      />

      <AdminRoadmapsTable roadmaps={roadmaps} />
    </main>
  );
}
