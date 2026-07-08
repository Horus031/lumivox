import { requireUser } from "@/lib/auth/require-user";
import { LEARNING_DOCUMENT_BUCKET } from "@/features/learning-documents/learning-document.constants";
import { notFound } from "next/navigation";

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

export async function getLearningDocumentById(documentId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("learning_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch document: ${error.message}`);
  }

  return data;
}

export async function getOwnedLearningDocumentById(documentId: string) {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("learning_documents")
    .select("*")
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch owned document: ${error.message}`);
  }

  return data;
}

export async function getLearningDocumentPermissions(documentId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("learning_document_permissions")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch document permissions: ${error.message}`);
  }

  return data ?? [];
}

export async function getAccessibleLearningDocumentOrThrow(documentId: string) {
  const document = await getLearningDocumentById(documentId);

  if (!document) {
    notFound();
  }

  return document;
}

export async function createLearningDocumentSignedUrl(filePath: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.storage
    .from(LEARNING_DOCUMENT_BUCKET)
    .createSignedUrl(filePath, 60 * 10);

  if (error) {
    throw new Error(`Failed to create document signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

export async function getAccessibleProcessedLearningDocuments() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("learning_documents")
    .select("*")
    .eq("extracted_text_status", "completed")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Failed to fetch processed learning documents: ${error.message}`,
    );
  }

  return data ?? [];
}
