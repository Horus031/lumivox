import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { getGoalLearningDocuments } from "@/features/learning-documents/learning-document.queries";
import { GoalDocumentUploadForm } from "@/features/learning-documents/components/goal-document-upload-form";
import { GoalDocumentList } from "@/features/learning-documents/components/goal-document-list";

type GoalDetailPageProps = {
  params: Promise<{
    goalId: string;
  }>;
};

export default async function GoalDetailPage({ params }: GoalDetailPageProps) {
  const { goalId } = await params;

  const { supabase, user } = await requireUser();

  const { data: goal, error } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch goal: ${error.message}`);
  }

  if (!goal) {
    notFound();
  }

  const documents = await getGoalLearningDocuments(goalId);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-background p-6 shadow-sm ">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Goal Detail
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
