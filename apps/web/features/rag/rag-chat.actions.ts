"use server";

import { AiApiError, AiApiTransportError, fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";

type RagPromptVariant = "no_rule" | "grounded_rule";

export type RagContextMetadata = {
  estimated_prompt_tokens: number;
  history_turns_used: number;
  retrieved_chunks_used: number;
  context_truncated: boolean;
  retrieval_strategy: "none" | "current_question" | "history_augmented";
  generation_attempts: number;
};

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
  clientRequestId?: string;
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
  turn_id?: string | null;
  turn_index?: number | null;
  completed_turn_count?: number | null;
  context?: RagContextMetadata | null;
  soft_turn_limit?: number | null;
  hard_turn_limit?: number | null;
};

type RagAskActionResult =
  | Extract<ActionResult<RagAskActionResponse>, { success: true }>
  | {
      success: false;
      message: string;
      code?: string;
      retrySameRequest: boolean;
      sessionId?: string;
    };

export async function askRagQuestionAction(
  payload: RagAskActionPayload,
): Promise<RagAskActionResult> {
  try {
    const { user } = await requireUser();

    const question = payload.question.trim();

    if (!question) {
      return {
        success: false,
        message: "Please enter a question.",
        retrySameRequest: false,
      };
    }

    if (question.length > 2000) {
      return {
        success: false,
        message: "Question is too long. Please keep it under 2000 characters.",
        retrySameRequest: false,
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
        retrySameRequest: true,
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
        client_request_id: payload.clientRequestId ?? null,
      },
    });

    return {
      success: true,
      message: "Answer generated.",
      data: result,
    };
  } catch (error) {
    if (error instanceof AiApiError) {
      const sessionId = error.details?.session_id;

      return {
        success: false,
        message: error.message,
        code: error.code,
        sessionId: typeof sessionId === "string" ? sessionId : undefined,
        retrySameRequest:
          error.code !== "RAG_GENERATION_FAILED" &&
          (error.code === "RAG_TURN_IN_PROGRESS" ||
            error.code === "RAG_INVALID_LEASE" ||
            error.status === 408 ||
            error.status === 429 ||
            error.status >= 500),
      };
    }

    return {
      success: false,
      code: error instanceof AiApiTransportError ? error.code : undefined,
      retrySameRequest: true,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while asking the study assistant.",
    };
  }
}

export type RagRestoredMessage = {
  id: string;
  turn_id: string;
  role: "user" | "assistant";
  content: string;
  turn_index: number;
};

export type RagConversationRestoreResponse = {
  enabled: boolean;
  session_id: string | null;
  completed_turn_count: number;
  soft_turn_limit?: number | null;
  hard_turn_limit?: number | null;
  selected_document_ids: string[];
  top_k: number;
  prompt_variant: RagPromptVariant;
  messages: RagRestoredMessage[];
};

export async function restoreRagConversationAction(
  focusSessionId: string,
): Promise<ActionResult<RagConversationRestoreResponse>> {
  try {
    const { user } = await requireUser();

    const result = await fetchAiApi<RagConversationRestoreResponse>({
      path: "/api/v1/rag/chat/restore",
      body: {
        user_id: user.id,
        focus_session_id: focusSessionId,
      },
      retries: 0,
    });

    return {
      success: true,
      message: "Conversation loaded.",
      data: result,
    };
  } catch {
    return {
      success: false,
      message: "Unable to restore conversation.",
    };
  }
}
