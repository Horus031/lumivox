"use server";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { LEARNING_DOCUMENT_BUCKET } from "@/features/learning-documents/learning-document.constants";

type PreviewUrlPayload = {
  signedUrl: string;
};

export async function createLearningDocumentPreviewUrlAction(
  documentId: string,
): Promise<ActionResult<PreviewUrlPayload>> {
  try {
    const { supabase } = await requireUser();

    const { data: document, error: documentError } = await supabase
      .from("learning_documents")
      .select("id,file_path")
      .eq("id", documentId)
      .maybeSingle();

    if (documentError) {
      return {
        success: false,
        message: `Failed to fetch document: ${documentError.message}`,
      };
    }

    if (!document) {
      return {
        success: false,
        message: "Document not found or you do not have access.",
      };
    }

    const { data, error } = await supabase.storage
      .from(LEARNING_DOCUMENT_BUCKET)
      .createSignedUrl(document.file_path, 60 * 10);

    if (error) {
      return {
        success: false,
        message: `Failed to create preview URL: ${error.message}`,
      };
    }

    return {
      success: true,
      message: "Preview URL created.",
      data: {
        signedUrl: data.signedUrl,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while creating preview URL.",
    };
  }
}
