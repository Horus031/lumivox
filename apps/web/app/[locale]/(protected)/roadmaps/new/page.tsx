import { RoadmapGenerateForm } from "@/features/roadmaps/components/roadmap-generate-form";
import type { SupportedLocale } from "@/features/roadmaps/roadmap.types";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { getTranslations } from "next-intl/server";

type NewRoadmapPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function NewRoadmapPage({
  params,
}: NewRoadmapPageProps) {
  const { locale } = await params;
  const t = await getTranslations("roadmaps");

  const preferredLocale: SupportedLocale = locale === "vi" ? "vi" : "en";

  return (
    <section className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("title")} title={t("newTitle")} description={t("newDescription")} />

      <RoadmapGenerateForm preferredLocale={preferredLocale} />
    </section>
  );
}
