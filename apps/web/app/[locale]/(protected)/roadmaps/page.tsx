import { Link } from "@/i18n/navigation";
import { RoadmapList } from "@/features/roadmaps/components/roadmap-list";
import { getMyRoadmaps } from "@/features/roadmaps/roadmap.queries";

export default async function RoadmapsPage() {
  const roadmaps = await getMyRoadmaps();

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              AI Planning
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
              Learning Roadmaps
            </h1>

            <p className="mt-3 max-w-2xl text-neutral-600 dark:text-neutral-400">
              Generate AI-powered learning roadmaps and later apply them into
              your goals, tasks, and subtasks.
            </p>
          </div>

          <Link
            href="/roadmaps/new"
            className="inline-flex rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            Create roadmap
          </Link>
        </div>
      </section>

      <RoadmapList roadmaps={roadmaps} />
    </main>
  );
}