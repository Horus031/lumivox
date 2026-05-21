import { PageHeader } from "@/features/app-shell/components/page-header";
import { getLatestWeeklyReflectionCards } from "@/features/weekly-reflections/weekly-reflection.queries";
import { WeeklyReflectionSection } from "@/features/weekly-reflections/components/weekly-reflection-section";
import { GenerateWeeklyReflectionButton } from "@/features/weekly-reflections/components/generate-weekly-reflection-button";

export default async function ReflectionsPage() {
  const reflectionCards = await getLatestWeeklyReflectionCards(20);

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex justify-between items-center">
          <PageHeader
            eyebrow="Lumivox"
            title="Weekly Reflections"
            description="Review structured weekly behaviour summaries and AI-generated reflections grounded in your own learning data."
          />

          <GenerateWeeklyReflectionButton />
        </div>

        <WeeklyReflectionSection cards={reflectionCards} />
      </div>
    </section>
  );
}
