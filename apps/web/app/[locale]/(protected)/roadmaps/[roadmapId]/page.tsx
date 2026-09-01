import { RoadmapDetailHeader } from "@/features/roadmaps/components/roadmap-detail-header";
import { RoadmapTreePreview } from "@/features/roadmaps/components/roadmap-tree-preview";
import { getMyRoadmapDetail } from "@/features/roadmaps/roadmap.queries";

type RoadmapDetailPageProps = {
  params: Promise<{
    roadmapId: string;
  }>;
};

export default async function RoadmapDetailPage({
  params,
}: RoadmapDetailPageProps) {
  const { roadmapId } = await params;

  const { roadmap, nodes, tree } = await getMyRoadmapDetail(roadmapId);

  return (
    <main className="space-y-6">
      <RoadmapDetailHeader roadmap={roadmap} nodeCount={nodes.length} />

      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Draft Tree Preview
            </p>

            <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
              Goals, tasks and subtasks
            </h2>
          </div>

          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Visual drag editor comes in the next phase.
          </p>
        </div>

        <div className="mt-6">
          <RoadmapTreePreview tree={tree} />
        </div>
      </section>
    </main>
  );
}