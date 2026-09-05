import { Link } from "@/i18n/navigation";
import { RoadmapList } from "@/features/roadmaps/components/roadmap-list";
import { getMyRoadmaps } from "@/features/roadmaps/roadmap.queries";
import { PageHeader } from "@/features/app-shell/components/page-header";
// import { getTranslations } from "next-intl/server";

export default async function RoadmapsPage() {
  // const t = await getTranslations("tasks.page");
  const roadmaps = await getMyRoadmaps();

  return (
    <section className="mx-auto space-y-16">
      <PageHeader
        eyebrow="Lumivox"
        title="Learning Roadmaps"
        description="Generate AI-powered learning roadmaps and later apply them into your goals, tasks, and subtasks."
        action={
          <Link
            href="/roadmaps/new"
            className="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-foreground shadow-sm hover:bg-primary/90 h-9 px-4 py-2"
          >
            Create roadmap
          </Link>
        }
      />

      <RoadmapList roadmaps={roadmaps} />
    </section>
  );
}
