import { Link } from "@/i18n/navigation";
import type { LearningRoadmap } from "@/features/roadmaps/roadmap.types";

type RoadmapDetailHeaderProps = {
  roadmap: LearningRoadmap;
  nodeCount: number;
};

export function RoadmapDetailHeader({
  roadmap,
  nodeCount,
}: RoadmapDetailHeaderProps) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            AI Learning Roadmap
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
            {roadmap.title}
          </h1>

          <p className="mt-3 max-w-3xl text-neutral-600 dark:text-neutral-400">
            {roadmap.description ?? roadmap.topic}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              {roadmap.status}
            </span>

            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              {nodeCount} nodes
            </span>

            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              {roadmap.preferred_locale.toUpperCase()}
            </span>

            {roadmap.ai_model ? (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                {roadmap.ai_provider ?? "AI"} · {roadmap.ai_model}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/roadmaps"
            className="rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            Back
          </Link>

          <Link
            href={`/roadmaps/${roadmap.id}/edit`}
            className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            Edit visual tree
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Topic
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-neutral-50">
            {roadmap.topic}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Level
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-neutral-50">
            {roadmap.current_level} → {roadmap.target_level}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Date range
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-neutral-50">
            {roadmap.start_date} → {roadmap.end_date}
          </p>
        </div>

        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Study time
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-neutral-50">
            {roadmap.study_days_per_week}d/week ·{" "}
            {roadmap.minutes_per_study_day}m/day
          </p>
        </div>
      </div>
    </section>
  );
}