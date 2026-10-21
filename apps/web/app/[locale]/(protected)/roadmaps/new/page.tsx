import { RoadmapGenerateForm } from "@/features/roadmaps/components/roadmap-generate-form";
import type { SupportedLocale } from "@/features/roadmaps/roadmap.types";

type NewRoadmapPageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function NewRoadmapPage({
  params,
}: NewRoadmapPageProps) {
  const { locale } = await params;

  const preferredLocale: SupportedLocale = locale === "vi" ? "vi" : "en";

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          AI Roadmap Generator
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          Create a learning roadmap
        </h1>

        <p className="mt-3 max-w-3xl text-neutral-600 dark:text-neutral-400">
          Tell Lumivox what you want to learn, how much time you have, and your
          target outcome. The AI will generate an editable roadmap tree.
        </p>
      </section>

      <RoadmapGenerateForm preferredLocale={preferredLocale} />
    </main>
  );
}