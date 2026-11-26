"use server";

import { AiApiError, AiApiTransportError, fetchAiApi } from "@/lib/ai-api/fetch-ai-api";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkRateLimit, formatRateLimitMessage } from "@/lib/redis/rate-limit";
import { z } from "zod";

type RagPromptVariant = "no_rule" | "grounded_rule";

export type RagContextMetadata = {
  estimated_prompt_tokens: number;
  history_turns_used: number;
  retrieved_chunks_used: number;
  context_truncated: boolean;
  retrieval_strategy: "none" | "current_question" | "history_augmented";
  generation_attempts: number;
  summary_version_used?: number | null;
  summary_tokens_used?: number;
  summary_covered_turn_index?: number | null;
  summary_generation_method?: "llm" | "extractive" | null;
  handoff_used?: boolean;
  handoff_tokens_used?: number;
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
  conversationProtocol?: "legacy" | "v2";
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
      outcome?: "failed" | "unknown";
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
        conversation_protocol: payload.conversationProtocol ?? null,
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
      const outcome = error.details?.outcome;

      return {
        success: false,
        message: error.message,
        code: error.code,
        sessionId: typeof sessionId === "string" ? sessionId : undefined,
        outcome: outcome === "failed" || outcome === "unknown" ? outcome : undefined,
        retrySameRequest:
          outcome === "unknown" || (outcome !== "failed" &&
          error.code !== "RAG_GENERATION_FAILED" &&
          error.code !== "RAG_INVALID_RESPONSE" &&
          (error.code === "RAG_TURN_IN_PROGRESS" ||
            error.code === "RAG_INVALID_LEASE" ||
            error.status === 408 ||
            error.status === 429 ||
            error.status >= 500)),
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
  recovery_enabled?: boolean;
  pending_operation?: {
    operation: "ask";
    client_request_id: string;
    status: "processing" | "expired";
    lease_expires_at: string;
  } | null;
  new_chat_enabled?: boolean;
  handoff_enabled?: boolean;
  has_handoff?: boolean;
  content_available?: boolean;
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

export type RagOperationStatus =
  | "unknown" | "processing" | "completed" | "failed" | "expired" | "access_unavailable";

export type RagOperationStatusResponse = {
  operation: "ask" | "new_chat";
  status: RagOperationStatus;
  session_id?: string | null;
  session_status?: "active" | "closed" | null;
  turn_id?: string | null;
  turn_index?: number | null;
  completed_turn_count?: number | null;
  source_session_id?: string | null;
  target_session_id?: string | null;
  lease_expires_at?: string | null;
};

const operationStatusSchema = z.object({
  focusSessionId: z.uuid(), clientRequestId: z.uuid(),
  operation: z.enum(["ask", "new_chat"]), recoverExpired: z.boolean().optional(),
}).refine((input) => !input.recoverExpired || input.operation === "ask");

export async function reconcileRagOperationAction(
  input: z.input<typeof operationStatusSchema>,
): Promise<ActionResult<RagOperationStatusResponse>> {
  const parsed = operationStatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Invalid operation reference." };
  const data = parsed.data;
  try {
    const { user } = await requireUser();
    const rateLimit = await checkRateLimit({ key: `rag-recovery:${user.id}`, limit: 30, window: "1 m" });
    if (!rateLimit.success) return { success: false, message: formatRateLimitMessage(rateLimit.reset) };
    const result = await fetchAiApi<RagOperationStatusResponse>({
      path: "/api/v1/rag/chat/operation-status",
      body: {
        user_id: user.id, focus_session_id: data.focusSessionId, client_request_id: data.clientRequestId,
        operation: data.operation, recover_expired: data.recoverExpired ?? false,
      },
      retries: 0, timeoutMs: 10_000,
    });
    return { success: true, message: "Operation reconciled.", data: result };
  } catch {
    return { success: false, message: "Unable to reconcile operation." };
  }
}

export type RagNewChatMode = "fresh" | "continue";

const newChatPayloadSchema = z.object({
  focusSessionId: z.uuid(),
  sourceSessionId: z.uuid(),
  clientRequestId: z.uuid(),
  mode: z.enum(["fresh", "continue"]),
  selectedDocumentIds: z.array(z.uuid()),
  topK: z.number().int().min(1).max(9),
  promptVariant: z.enum(["grounded_rule", "no_rule"]),
  preferredLocale: z.enum(["en", "vi"]).optional(),
});
export type RagNewChatPayload = z.infer<typeof newChatPayloadSchema>;

export type RagNewChatResponse = {
  source_session_id: string;
  target_session_id: string;
  mode: RagNewChatMode;
  has_handoff: boolean;
};

export type RagConversationListItem = {
  id: string;
  title: string | null;
  status: "active" | "closed";
  completed_turn_count: number;
  has_handoff: boolean;
  content_available: boolean;
  created_at: string;
  updated_at: string;
};

const historyCursorSchema = z.object({ created_at: z.iso.datetime({ offset: true }), id: z.uuid() });
export type RagHistoryCursor = z.infer<typeof historyCursorSchema>;
export type RagHistoryResponse = {
  conversations: RagConversationListItem[];
  next_cursor: RagHistoryCursor | null;
};
export type RagHistoryDetail = {
  session_id: string;
  status: "active" | "closed";
  completed_turn_count: number;
  messages: RagRestoredMessage[];
  read_only: boolean;
};

type ChatLifecycleResult<T> =
  | Extract<ActionResult<T>, { success: true }>
  | { success: false; code?: string; message: string; retrySameRequest: boolean };

async function lifecycleRequest<T>(
  operation: "new" | "history" | "history/detail",
  payload: Record<string, unknown>,
): Promise<ChatLifecycleResult<T>> {
  const isTransition = operation === "new";
  try {
    const { user } = await requireUser();
    const rateLimit = await checkRateLimit({
      key: isTransition ? `rag-new-chat:${user.id}` : `rag-history:${user.id}`,
      limit: isTransition ? 5 : 30,
      window: isTransition ? "10 m" : "1 m",
    });
    if (!rateLimit.success) {
      return {
        success: false, code: "RAG_RATE_LIMITED",
        message: formatRateLimitMessage(rateLimit.reset), retrySameRequest: true,
      };
    }
    const data = await fetchAiApi<T>({
      path: `/api/v1/rag/chat/${operation}`, body: { ...payload, user_id: user.id }, retries: 0,
    });
    return { success: true, message: "Conversation loaded.", data };
  } catch (error) {
    return {
      success: false,
      message: "The conversation request failed.",
      code: error instanceof AiApiError || error instanceof AiApiTransportError ? error.code : undefined,
      retrySameRequest: isTransition && (
        error instanceof AiApiTransportError
        || (error instanceof AiApiError && (error.status === 408 || error.status >= 500))
      ),
    };
  }
}

export async function startNewRagConversationAction(
  input: RagNewChatPayload,
): Promise<ChatLifecycleResult<RagNewChatResponse>> {
  const parsed = newChatPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, code: "RAG_INVALID_REQUEST", message: "Invalid request.", retrySameRequest: false };
  }
  const data = parsed.data;
  return lifecycleRequest("new", {
    focus_session_id: data.focusSessionId, source_session_id: data.sourceSessionId,
    client_request_id: data.clientRequestId, mode: data.mode,
    selected_document_ids: data.selectedDocumentIds, top_k: data.topK,
    prompt_variant: data.promptVariant, preferred_locale: data.preferredLocale ?? "auto",
  });
}

export async function listRagConversationsAction(
  focusId: string, cursor: RagHistoryCursor | null = null,
): Promise<ChatLifecycleResult<RagHistoryResponse>> {
  const parsed = z.object({ focusId: z.uuid(), cursor: historyCursorSchema.nullable() }).safeParse({
    focusId, cursor,
  });
  if (!parsed.success) {
    return { success: false, code: "RAG_INVALID_REQUEST", message: "Invalid request.", retrySameRequest: false };
  }
  return lifecycleRequest("history", {
    focus_session_id: parsed.data.focusId, cursor: parsed.data.cursor, limit: 20,
  });
}

export async function restoreRagHistoryAction(
  focusId: string, sessionId: string,
): Promise<ChatLifecycleResult<RagHistoryDetail>> {
  const parsed = z.object({ focusId: z.uuid(), sessionId: z.uuid() }).safeParse({ focusId, sessionId });
  if (!parsed.success) {
    return { success: false, code: "RAG_INVALID_REQUEST", message: "Invalid request.", retrySameRequest: false };
  }
  return lifecycleRequest("history/detail", {
    focus_session_id: parsed.data.focusId, session_id: parsed.data.sessionId,
  });
}
