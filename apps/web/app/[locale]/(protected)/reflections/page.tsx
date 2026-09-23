import { Suspense } from "react";

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

async function ReflectionCardsSection({ locale }: { locale: string }) {
  const cards = await getLatestWeeklyReflectionCards(
    20,
    normalizeAiLocale(locale),
  );

  return <WeeklyReflectionSection cards={cards} />;
}

function ReflectionCardsFallback() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-56 animate-pulse rounded-[28px] border border-border/60 bg-card/60"
        />
      ))}
    </div>
  );
}

export default async function ReflectionsPage({
  params,
}: ReflectionsPageProps) {
  const [{ locale }, t] = await Promise.all([
    params,
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

        <Suspense fallback={<ReflectionCardsFallback />}>
          <ReflectionCardsSection locale={locale} />
        </Suspense>
      </div>
    </section>
  );
}
