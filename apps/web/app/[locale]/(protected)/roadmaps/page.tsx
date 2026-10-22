import { Link } from "@/i18n/navigation";
import { RoadmapList } from "@/features/roadmaps/components/roadmap-list";
import { getMyRoadmaps } from "@/features/roadmaps/roadmap.queries";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";

export default async function RoadmapsPage() {
  const [roadmaps, t] = await Promise.all([getMyRoadmaps(), getTranslations("roadmaps")]);

  return (
    <section className="mx-auto space-y-section">
      <PageHeader
        eyebrow="Lumivox"
        title={t("title")}
        description={t("description")}
        action={
          <Button asChild>
            <Link href="/roadmaps/new"><Plus aria-hidden="true" />{t("create")}</Link>
          </Button>
        }
      />

      <RoadmapList roadmaps={roadmaps} />
    </section>
  );
}
