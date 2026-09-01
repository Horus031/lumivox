import { RoadmapVisualEditor } from "@/features/roadmaps/components/roadmap-visual-editor";
import { getMyRoadmapDetail } from "@/features/roadmaps/roadmap.queries";
import { redirect } from "next/navigation";

type RoadmapEditPageProps = {
  params: Promise<{
    roadmapId: string;
  }>;
};

export default async function RoadmapEditPage({
  params,
}: RoadmapEditPageProps) {
  const { roadmapId } = await params;

  const { roadmap, nodes } = await getMyRoadmapDetail(roadmapId);

  if (roadmap.status !== "draft") {
    redirect(`/roadmaps/${roadmap.id}`);
  }

  return (
    <main>
      <RoadmapVisualEditor roadmap={roadmap} initialNodes={nodes} />
    </main>
  );
}
