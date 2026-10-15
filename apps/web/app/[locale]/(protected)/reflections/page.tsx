import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { PageLoading } from "@/features/app-shell/components/page-loading";

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
  const t = useTranslations("common");
  return <PageLoading label={t("loading")} />;
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
      <div className="min-w-0 space-y-section">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
          action={<GenerateWeeklyReflectionButton />}
        />

        <Suspense fallback={<ReflectionCardsFallback />}>
          <ReflectionCardsSection locale={locale} />
        </Suspense>
      </div>
    </section>
  );
}
