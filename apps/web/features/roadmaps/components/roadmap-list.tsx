import { Link } from "@/i18n/navigation";
import type { LearningRoadmap } from "@/features/roadmaps/roadmap.types";

type RoadmapListProps = {
  roadmaps: LearningRoadmap[];
};

function statusClass(status: string) {
  if (status === "applied") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (status === "archived") {
    return "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300";
  }

  return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
}

export function RoadmapList({ roadmaps }: RoadmapListProps) {
  if (roadmaps.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed bg-surface p-10 text-center">
        <h2 className="text-xl font-semibold text-foreground">
          No roadmaps yet
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          Generate your first AI learning roadmap to turn a study goal into a
          structured plan.
        </p>

        <Link
          href="/roadmaps/new"
          className="mt-6 inline-flex rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
        >
          Create roadmap
        </Link>
      </section>
    );
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {roadmaps.map((roadmap) => (
        <Link
          key={roadmap.id}
          href={`/roadmaps/${roadmap.id}`}
          className="rounded-2xl border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {roadmap.subject_name ?? "Learning Roadmap"}
              </p>

              <h2 className="mt-2 line-clamp-2 text-xl font-bold text-foreground">
                {roadmap.title}
              </h2>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                roadmap.status
              )}`}
            >
              {roadmap.status}
            </span>
          </div>

          <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
            {roadmap.description ?? roadmap.topic}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-background p-3">
              <p className="text-xs text-muted-foreground">
                Duration
              </p>
              <p className="mt-1 font-medium text-foreground">
                {roadmap.start_date} → {roadmap.end_date}
              </p>
            </div>

            <div className="rounded-xl bg-background p-3">
              <p className="text-xs text-muted-foreground">
                Study time
              </p>
              <p className="mt-1 font-medium text-foreground">
                {roadmap.study_days_per_week}d/w ·{" "}
                {roadmap.minutes_per_study_day}m
              </p>
            </div>
          </div>
        </Link>
      ))}
    </section>
  );
}