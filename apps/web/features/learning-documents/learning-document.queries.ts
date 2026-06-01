import { requireUser } from "@/lib/auth/require-user";
import { LEARNING_DOCUMENT_BUCKET } from "@/features/learning-documents/learning-document.constants";

export async function getGoalLearningDocuments(goalId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("learning_documents")
    .select("*")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch learning documents: ${error.message}`);
  }

  return data ?? [];
}

export async function createLearningDocumentSignedUrl(filePath: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.storage
    .from(LEARNING_DOCUMENT_BUCKET)
    .createSignedUrl(filePath, 60 * 10);

  if (error) {
    throw new Error(`Failed to create document preview URL: ${error.message}`);
  }

  return data.signedUrl;
}
