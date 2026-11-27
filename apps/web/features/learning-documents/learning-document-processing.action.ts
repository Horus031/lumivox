"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import type { ActionResult } from "@/lib/actions/action-result";
import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
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
  const t = await getTranslations("rag");
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
      .select(
        `
          id,
          owner_id,
          goal_id,
          task_id
        `,
      )
      .eq("id", documentId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) {
      return {
        success: false,
        message: t("documentProcessingUnavailable"),
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

    if (document.goal_id) {
      revalidatePath("/workspace");

      revalidatePath(`/goals/${document.goal_id}`);
    }

    if (document.task_id) {
      revalidatePath("/workspace");
    }

    revalidatePath(`/documents/${documentId}/share`);

    revalidatePath(`/documents/shared/${documentId}`);

    const message = t(result.status === "completed" ? "documentProcessingSucceeded"
      : result.status === "unsupported" ? "documentProcessingUnsupported" : "documentProcessingUnavailable");
    return { success: result.status === "completed", message, data: { ...result, message } };
  } catch {
    return {
      success: false,

      message: t("documentProcessingUnavailable"),
    };
  }
}
