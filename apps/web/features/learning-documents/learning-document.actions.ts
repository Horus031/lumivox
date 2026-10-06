"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/action-result";
import { requireUser } from "@/lib/auth/require-user";

import {
  isAllowedLearningDocumentMimeType,
  isAllowedTaskLearningDocumentMimeType,
  LEARNING_DOCUMENT_BUCKET,
  MAX_LEARNING_DOCUMENT_SIZE_BYTES,
} from "./learning-document.constants";

type DocumentContext =
  | {
      kind: "goal";
      id: string;
    }
  | {
      kind: "task";
      id: string;
    };

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function getFileValidationError(file: File, context: DocumentContext) {
  if (file.size <= 0) {
    return "The selected file is empty.";
  }

  if (file.size > MAX_LEARNING_DOCUMENT_SIZE_BYTES) {
    return "File is too large. Please upload a file up to 6MB.";
  }

  if (context.kind === "task") {
    if (!isAllowedTaskLearningDocumentMimeType(file.type)) {
      return "Task learning documents currently support PDF, TXT, and Markdown files.";
    }

    return null;
  }

  if (!isAllowedLearningDocumentMimeType(file.type)) {
    return "Unsupported file type.";
  }

  return null;
}

async function uploadLearningDocument(
  formData: FormData,
  contextKind: "goal" | "task",
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const idField = contextKind === "goal" ? "goalId" : "taskId";

    const contextId = formData.get(idField);

    const fileRaw = formData.get("file");

    if (!contextId || typeof contextId !== "string") {
      return {
        success: false,
        message:
          contextKind === "goal"
            ? "Goal ID is required."
            : "Task ID is required.",
      };
    }

    if (!(fileRaw instanceof File)) {
      return {
        success: false,
        message: "Please select a file to upload.",
      };
    }

    const context: DocumentContext = {
      kind: contextKind,
      id: contextId,
    };

    const validationError = getFileValidationError(fileRaw, context);

    if (validationError) {
      return {
        success: false,
        message: validationError,
      };
    }

    if (context.kind === "goal") {
      const { data: goal, error: goalError } = await supabase
        .from("goals")
        .select("id")
        .eq("id", context.id)
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
    } else {
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("id")
        .eq("id", context.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (taskError) {
        return {
          success: false,
          message: `Failed to verify task ownership: ${taskError.message}`,
        };
      }

      if (!task) {
        return {
          success: false,
          message: "Task not found or you do not have access to it.",
        };
      }
    }

    const documentId = crypto.randomUUID();

    const safeFileName = sanitizeFileName(fileRaw.name);

    const folder = context.kind === "goal" ? "goals" : "tasks";

    const filePath = `${user.id}/${folder}/${context.id}/${documentId}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(LEARNING_DOCUMENT_BUCKET)
      .upload(filePath, fileRaw, {
        contentType: fileRaw.type,

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

        goal_id: context.kind === "goal" ? context.id : null,

        task_id: context.kind === "task" ? context.id : null,

        file_name: fileRaw.name,

        file_path: filePath,

        mime_type: fileRaw.type,

        file_size_bytes: fileRaw.size,

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

    if (context.kind === "goal") {
      revalidatePath("/workspace");

      revalidatePath(`/goals/${context.id}`);
    } else {
      revalidatePath("/workspace");
    }

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

export async function uploadGoalLearningDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  return uploadLearningDocument(formData, "goal");
}

export async function uploadTaskLearningDocumentAction(
  formData: FormData,
): Promise<ActionResult> {
  return uploadLearningDocument(formData, "task");
}

export async function deleteLearningDocumentAction(
  documentId: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data: document, error: documentError } = await supabase
      .from("learning_documents")
      .select(
        `
          id,
          owner_id,
          goal_id,
          task_id,
          file_path
        `,
      )
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

    if (document.goal_id) {
      revalidatePath("/workspace");

      revalidatePath(`/goals/${document.goal_id}`);
    }

    if (document.task_id) {
      revalidatePath("/workspace");
    }

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
