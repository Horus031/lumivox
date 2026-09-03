"use server";

import { revalidatePath } from "next/cache";

import { fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

type RagPromptVariant = "no_rule" | "grounded_rule";

export type RagSourceChunk = {
  chunk_id: string;
  document_id: string;
  file_name: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

export type RagAskActionPayload = {
  question: string;
  selectedDocumentIds?: string[];
  focusSessionId?: string | null;
  sessionId?: string | null;
  topK?: number;
  promptVariant?: RagPromptVariant;
  preferredLocale?: "vi" | "en";
};

export type RagAskActionResponse = {
  session_id: string;
  answer: string;
  sources: RagSourceChunk[];
  prompt_variant: RagPromptVariant;
  context_mode: "general" | "document_rag";
  selected_document_ids: string[];
  top_k: number;
  latency_ms: number;
};

export async function askRagQuestionAction(
  payload: RagAskActionPayload,
): Promise<ActionResult<RagAskActionResponse>> {
  try {
    const { user } = await requireUser();

    const question = payload.question.trim();

    if (!question) {
      return {
        success: false,
        message: "Please enter a question.",
      };
    }

    if (question.length > 2000) {
      return {
        success: false,
        message: "Question is too long. Please keep it under 2000 characters.",
      };
    }

    const rateLimit = await checkRateLimit({
      key: `rag-chat:${user.id}`,
      limit: 10,
      window: "10 m",
    });

    if (!rateLimit.success) {
      return {
        success: false,
        message: formatRateLimitMessage(rateLimit.reset),
      };
    }

    const topK = payload.topK ?? 5;

    const result = await fetchAiApi<RagAskActionResponse>({
      path: "/api/v1/rag/chat/ask",
      body: {
        user_id: user.id,
        question,
        selected_document_ids: payload.selectedDocumentIds ?? [],
        focus_session_id: payload.focusSessionId ?? null,
        session_id: payload.sessionId ?? null,
        top_k: topK ?? 5,
        prompt_variant: payload.promptVariant ?? "grounded_rule",
        preferred_locale: payload.preferredLocale ?? "auto",
      },
    });

    revalidatePath("/focus");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Answer generated.",
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while asking the study assistant.",
    };
  }
}
