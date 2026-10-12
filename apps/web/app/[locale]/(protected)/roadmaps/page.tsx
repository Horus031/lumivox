import { Link } from "@/i18n/navigation";
import { RoadmapList } from "@/features/roadmaps/components/roadmap-list";
import { getMyRoadmaps } from "@/features/roadmaps/roadmap.queries";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { Button } from "@/components/ui/button";
// import { getTranslations } from "next-intl/server";

export default async function RoadmapsPage() {
  // const t = await getTranslations("tasks.page");
  const roadmaps = await getMyRoadmaps();

  return (
    <section className="mx-auto space-y-section">
      <PageHeader
        eyebrow="Lumivox"
        title="Learning Roadmaps"
        description="Generate AI-powered learning roadmaps and later apply them into your goals, tasks, and subtasks."
        action={
          <Button asChild>
            <Link href="/roadmaps/new">Create roadmap</Link>
          </Button>
        }
      />

      <RoadmapList roadmaps={roadmaps} />
    </section>
  );
}
