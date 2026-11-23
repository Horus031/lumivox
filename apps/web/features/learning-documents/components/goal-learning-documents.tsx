import { getGoalLearningDocuments } from "../learning-document.queries";
import { GoalDocumentList } from "./goal-document-list";
import { GoalDocumentUploadForm } from "./goal-document-upload-form";

export async function GoalLearningDocuments({ goalId }: { goalId: string }) {
  const documents = await getGoalLearningDocuments(goalId);

  return (
    <div className="min-w-0 space-y-card">
      <GoalDocumentUploadForm goalId={goalId} />
      <GoalDocumentList documents={documents} />
    </div>
  );
}
