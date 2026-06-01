"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";

import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  isAllowedLearningDocumentMimeType,
  LEARNING_DOCUMENT_BUCKET,
  MAX_LEARNING_DOCUMENT_SIZE_BYTES,
} from "@/features/learning-documents/learning-document.constants";

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export async function uploadGoalLearningDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const goalId = formData.get("goalId");
    const fileRaw = formData.get("file");

    if (!goalId || typeof goalId !== "string") {
      return {
        success: false,
        message: "Goal ID is required.",
      };
    }

    if (!(fileRaw instanceof File)) {
      return {
        success: false,
        message: "Please select a file to upload.",
      };
    }

    const file = fileRaw;

    if (file.size <= 0) {
      return {
        success: false,
        message: "The selected file is empty.",
      };
    }

    if (file.size > MAX_LEARNING_DOCUMENT_SIZE_BYTES) {
      return {
        success: false,
        message: "File is too large. Please upload a file up to 6MB.",
      };
    }

    if (!isAllowedLearningDocumentMimeType(file.type)) {
      return {
        success: false,
        message:
          "Unsupported file type. Please upload PDF, TXT, Markdown, PNG, JPG, or WebP.",
      };
    }

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id,user_id")
      .eq("id", goalId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (goalError) {
      return {
        success: false,
        message: `Failed to verify goal ownership: ${goalError.message}`,
      };
    }

    if (!goal) {
      return {
        success: false,
        message: "Goal not found or you do not have access to it.",
      };
    }

    const documentId = crypto.randomUUID();
    const safeFileName = sanitizeFileName(file.name);
    const filePath = `${user.id}/goals/${goalId}/${documentId}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(LEARNING_DOCUMENT_BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return {
        success: false,
        message: `Failed to upload file: ${uploadError.message}`,
      };
    }

    const { error: insertError } = await supabase
      .from("learning_documents")
      .insert({
        id: documentId,
        owner_id: user.id,
        goal_id: goalId,
        task_id: null,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type,
        file_size_bytes: file.size,
        visibility: "private",
        extracted_text_status: "pending",
      });

    if (insertError) {
      await supabase.storage.from(LEARNING_DOCUMENT_BUCKET).remove([filePath]);

      return {
        success: false,
        message: `Failed to save document metadata: ${insertError.message}`,
      };
    }

    revalidatePath("/goals");
    revalidatePath(`/goals/${goalId}`);
    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Learning document uploaded successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while uploading learning document.",
    };
  }
}

export async function deleteLearningDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data: document, error: documentError } = await supabase
      .from("learning_documents")
      .select("id,owner_id,goal_id,file_path")
      .eq("id", documentId)
      .eq("owner_id", user.id)
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
        message: "Document not found or you do not have permission.",
      };
    }

    const { error: removeError } = await supabase.storage
      .from(LEARNING_DOCUMENT_BUCKET)
      .remove([document.file_path]);

    if (removeError) {
      return {
        success: false,
        message: `Failed to remove file from storage: ${removeError.message}`,
      };
    }

    const { error: deleteError } = await supabase
      .from("learning_documents")
      .delete()
      .eq("id", document.id)
      .eq("owner_id", user.id);

    if (deleteError) {
      return {
        success: false,
        message: `Failed to delete document metadata: ${deleteError.message}`,
      };
    }

    revalidatePath("/goals");

    if (document.goal_id) {
      revalidatePath(`/goals/${document.goal_id}`);
    }

    revalidatePath("/", "layout");

    return {
      success: true,
      message: "Learning document deleted successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while deleting learning document.",
    };
  }
}
