import { notFound } from "next/navigation";

import { getGoalById } from "@/features/goals/goal.queries";
import { getGoalLearningDocuments } from "@/features/learning-documents/learning-document.queries";
import { GoalDocumentUploadForm } from "@/features/learning-documents/components/goal-document-upload-form";
import { GoalDocumentList } from "@/features/learning-documents/components/goal-document-list";
import { getTranslations } from "next-intl/server";

type GoalDetailPageProps = {
  params: Promise<{
    goalId: string;
  }>;
};

export default async function GoalDetailPage({ params }: GoalDetailPageProps) {
  const { goalId } = await params;

  const [t, goal, documents] = await Promise.all([
    getTranslations("goals.detail"),
    getGoalById(goalId),
    getGoalLearningDocuments(goalId),
  ]);

  if (!goal) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-background p-6 shadow-sm ">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {goal.title}
        </h1>

        {goal.description ? (
          <p className="mt-3 max-w-3xl text-muted-foreground">
            {goal.description}
          </p>
        ) : null}
      </section>

      <GoalDocumentUploadForm goalId={goalId} />

      <GoalDocumentList documents={documents} />
    </main>
  );
}
