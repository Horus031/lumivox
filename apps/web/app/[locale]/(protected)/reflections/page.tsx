import { PageHeader } from "@/features/app-shell/components/page-header";
import { getLatestWeeklyReflectionCards } from "@/features/weekly-reflections/weekly-reflection.queries";
import { WeeklyReflectionSection } from "@/features/weekly-reflections/components/weekly-reflection-section";
import { GenerateWeeklyReflectionButton } from "@/features/weekly-reflections/components/generate-weekly-reflection-button";
import { getTranslations } from "next-intl/server";

export default async function ReflectionsPage() {
  const [reflectionCards, t] = await Promise.all([
    getLatestWeeklyReflectionCards(20),
    getTranslations("reflections.page"),
  ]);

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex justify-between items-center">
          <PageHeader
            eyebrow={t("eyebrow")}
            title={t("title")}
            description={t("description")}
          />

          <GenerateWeeklyReflectionButton />
        </div>

        <WeeklyReflectionSection cards={reflectionCards} />
      </div>
    </section>
  );
}
