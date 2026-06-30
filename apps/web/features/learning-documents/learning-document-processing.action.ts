"use server";

import { revalidatePath } from "next/cache";

import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

type ProcessLearningDocumentApiResponse = {
  document_id: string;
  status: string;
  chunk_count: number;
  message: string;
};

export async function processLearningDocumentAction(
  documentId: string,
): Promise<ActionResult<ProcessLearningDocumentApiResponse>> {
  try {
    const { supabase, user } = await requireUser();

    const rateLimit = await checkRateLimit({
      key: `rag-process-document:${user.id}`,
      limit: 5,
      window: "10 m",
    });

    if (!rateLimit.success) {
      return {
        success: false,
        message: formatRateLimitMessage(rateLimit.reset),
      };
    }

    const { data: document, error } = await supabase
      .from("learning_documents")
      .select("id,owner_id,goal_id")
      .eq("id", documentId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) {
      return {
        success: false,
        message: `Failed to verify document ownership: ${error.message}`,
      };
    }

    if (!document) {
      return {
        success: false,
        message: "Document not found or you do not own it.",
      };
    }

    const result = await fetchAiApi<ProcessLearningDocumentApiResponse>({
      path: "/api/v1/rag/documents/process",
      body: {
        document_id: documentId,
        user_id: user.id,
      },
    });

    revalidatePath("/goals");

    if (document.goal_id) {
      revalidatePath(`/goals/${document.goal_id}`);
    }

    revalidatePath(`/documents/${documentId}/share`);
    revalidatePath(`/documents/shared/${documentId}`);

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
          : "Unexpected error while processing document.",
    };
  }
}
