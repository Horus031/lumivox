"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/features/admin/admin-auth";
import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import type { ActionResult } from "@/lib/actions/action-result";

const reprocessDocumentSchema = z.object({
  documentId: z.string().uuid(),
  ownerId: z.string().uuid(),
});

const deleteDocumentSchema = z.object({
  documentId: z.string().uuid(),
  filePath: z.string().min(1),
});

type ProcessLearningDocumentApiResponse = {
  document_id: string;
  status: string;
  chunk_count: number;
  message: string;
};

export async function adminReprocessLearningDocumentAction(
  input: z.infer<typeof reprocessDocumentSchema>
): Promise<ActionResult<ProcessLearningDocumentApiResponse>> {
  try {
    await requireAdmin();

    const parsed = reprocessDocumentSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid re-process document input.",
      };
    }

    const result = await fetchAiApi<ProcessLearningDocumentApiResponse>({
      path: "/api/v1/rag/documents/process",
      body: {
        document_id: parsed.data.documentId,
        user_id: parsed.data.ownerId,
      },
    });

    revalidatePath("/admin/documents");
    revalidatePath(`/admin/documents/${parsed.data.documentId}`);

    return {
      success: result.status === "completed",
      message: result.message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while re-processing document.",
    };
  }
}

export async function adminDeleteLearningDocumentAction(
  input: z.infer<typeof deleteDocumentSchema>
): Promise<ActionResult> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = deleteDocumentSchema.safeParse(input);

    if (!parsed.success) {
      return {
        success: false,
        message: "Invalid delete document input.",
      };
    }

    const { documentId, filePath } = parsed.data;

    const { error: storageError } = await supabase.storage
      .from("learning-documents")
      .remove([filePath]);

    if (storageError) {
      return {
        success: false,
        message: `Failed to delete storage object: ${storageError.message}`,
      };
    }

    const { error: deleteError } = await supabase.rpc(
      "admin_delete_learning_document",
      {
        p_document_id: documentId,
      }
    );

    if (deleteError) {
      return {
        success: false,
        message: `Failed to delete document metadata: ${deleteError.message}`,
      };
    }

    revalidatePath("/admin/documents");

    return {
      success: true,
      message: "Document deleted successfully.",
      data: null,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while deleting document.",
    };
  }
}