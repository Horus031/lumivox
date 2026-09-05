import { PageHeader } from "@/features/app-shell/components/page-header";
import { getLatestWeeklyReflectionCards } from "@/features/weekly-reflections/weekly-reflection.queries";
import { WeeklyReflectionSection } from "@/features/weekly-reflections/components/weekly-reflection-section";
import { GenerateWeeklyReflectionButton } from "@/features/weekly-reflections/components/generate-weekly-reflection-button";
import { getTranslations } from "next-intl/server";

type ReflectionsPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

function normalizeAiLocale(locale: string) {
  return locale === "vi" ? "vi" : "en";
}

export default async function ReflectionsPage({
  params,
}: ReflectionsPageProps) {
  const { locale } = await params;
  const aiLocale = normalizeAiLocale(locale);
  const [reflectionCards, t] = await Promise.all([
    getLatestWeeklyReflectionCards(20, aiLocale),
    getTranslations("reflections.page"),
  ]);

  return (
    <section>
      <div className="mx-auto space-y-8">
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
