import { getGoalLearningDocuments } from "@/features/learning-documents/learning-document.queries";
import { GoalDocumentList } from "@/features/learning-documents/components/goal-document-list";
import { GoalDocumentUploadForm } from "@/features/learning-documents/components/goal-document-upload-form";

export async function WorkspaceGoalDocuments({ goalId }: { goalId: string }) {
  const documents = await getGoalLearningDocuments(goalId);
  return (
    <div className="min-w-0 space-y-5">
      <GoalDocumentList documents={documents} />
      <GoalDocumentUploadForm goalId={goalId} />
    </div>
  );
}
