import { RoadmapDetailHeader } from "@/features/roadmaps/components/roadmap-detail-header";
import { RoadmapTreePreview } from "@/features/roadmaps/components/roadmap-tree-preview";
import { getMyRoadmapDetail } from "@/features/roadmaps/roadmap.queries";
import { getTranslations } from "next-intl/server";

type RoadmapDetailPageProps = {
  params: Promise<{
    roadmapId: string;
  }>;
};

export default async function RoadmapDetailPage({
  params,
}: RoadmapDetailPageProps) {
  const { roadmapId } = await params;
  const t = await getTranslations("roadmaps");

  const { roadmap, nodes, tree } = await getMyRoadmapDetail(roadmapId);

  return (
    <section className="min-w-0 space-y-section">
      <RoadmapDetailHeader roadmap={roadmap} nodeCount={nodes.length} />

      <section className="min-w-0">
        <h2 className="text-section font-semibold">{t("treeTitle")}</h2>
        <div className="mt-4">
          <RoadmapTreePreview tree={tree} />
        </div>
      </section>
    </section>
  );
}
