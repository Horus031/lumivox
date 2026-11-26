"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  askRagQuestionAction,
  listRagConversationsAction,
  restoreRagConversationAction,
  restoreRagHistoryAction,
  startNewRagConversationAction,
  type RagConversationListItem,
  type RagConversationRestoreResponse,
  type RagContextMetadata,
  type RagHistoryCursor,
  type RagHistoryDetail,
  type RagNewChatPayload,
  type RagSourceChunk,
} from "@/features/rag/rag-chat.actions";
import { RagMarkdownMessage } from "@/features/rag/components/rag-markdown-message";
import { RagContextIndicator } from "./rag-context-indicator";
import { RagNewChatDialog } from "./rag-new-chat-dialog";
import { RagConversationHistory } from "./rag-conversation-history";
import { useRagOperationRecovery } from "../hooks/use-rag-operation-recovery";
import type { RagRecoveryReference } from "../lib/rag-recovery-journal";
type RagDocumentOption = {
  id: string;
  file_name: string;
  visibility: "private" | "shared" | "public";
};

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// import {
//   Select,
//   SelectContent,
//   SelectGroup,
//   SelectItem,
//   SelectLabel,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";

type ChatMessage = {
  id: string;
  turnId?: string;
  turnIndex?: number;
  role: "user" | "assistant";
  content: string;
  sources?: RagSourceChunk[];
  latencyMs?: number;
  contextMode?: "general" | "document_rag";
  topK?: number;
  promptVariant?: "no_rule" | "grounded_rule";
};

type PendingRagRequest = {
  clientRequestId: string;
  question: string;
  sessionId: string | null;
  focusSessionId: string | null;
  selectedDocumentIds: string[];
  topK: number;
  promptVariant: "grounded_rule" | "no_rule";
  preferredLocale: "vi" | "en";
  conversationProtocol?: "legacy" | "v2";
};

const CANONICAL_RESTORE_CODES = new Set([
  "RAG_SESSION_CLOSED", "RAG_SESSION_NOT_FOUND", "RAG_CONTEXT_CHANGED",
  "RAG_HANDOFF_SOURCE_CHANGED", "RAG_DOCUMENT_ACCESS_DENIED", "RAG_V2_DISABLED", "RAG_PROTOCOL_MISMATCH",
  "RAG_NEW_CHAT_DISABLED", "RAG_HANDOFF_DISABLED",
]);
const CONFIG_CHANGED_CODES = new Set([
  "RAG_V2_DISABLED", "RAG_PROTOCOL_MISMATCH", "RAG_NEW_CHAT_DISABLED", "RAG_HANDOFF_DISABLED",
]);

const REQUEST_ERROR_MESSAGES = new Map<string, string>([
  ["AI_API_TIMEOUT", "requestOutcomeUnknown"],
  ["AI_API_UNAVAILABLE", "requestOutcomeUnknown"],
  ["RAG_TURN_OUTCOME_UNKNOWN", "requestOutcomeUnknown"],
  ["RAG_PERSISTENCE_UNAVAILABLE", "requestOutcomeUnknown"],
  ["RAG_INTERNAL_ERROR", "requestOutcomeUnknown"],
  ["RAG_INVALID_LEASE", "requestOutcomeUnknown"],
  ["RAG_INVALID_RESPONSE", "requestOutcomeUnknown"],
  ["RAG_TURN_IN_PROGRESS", "turnInProgress"],
  ["RAG_GENERATION_FAILED", "turnFailed"],
  ["RAG_PREVIOUS_TURN_FAILED", "turnFailed"],
  ["RAG_IDEMPOTENCY_CONFLICT", "idempotencyConflict"],
  ["RAG_DOCUMENT_ACCESS_DENIED", "documentAccessDenied"],
  ["RAG_SESSION_NOT_FOUND", "conversationUnavailable"],
  ["RAG_SESSION_CLOSED", "conversationUnavailable"],
  ["RAG_CONTEXT_CHANGED", "conversationUnavailable"],
  ["RAG_CONTEXT_UNAVAILABLE", "conversationUnavailable"],
  ["RAG_CONVERSATION_LIMIT_REACHED", "conversationLimitReached"],
]);

const TRANSITION_ERROR_MESSAGES = new Map<string, string>([
  ["RAG_HANDOFF_SOURCE_CHANGED", "handoffSourceChanged"],
  ["RAG_HANDOFF_SCOPE_CHANGED", "handoffSourceChanged"],
  ["RAG_SESSION_CLOSED", "handoffSourceChanged"],
  ["RAG_DOCUMENT_ACCESS_DENIED", "historyAccessUnavailable"],
  ["RAG_IDEMPOTENCY_CONFLICT", "idempotencyConflict"],
  ["RAG_TURN_IN_PROGRESS", "turnInProgress"],
]);

type RagStudyAssistantProps = {
  compact?: boolean;
  fillHeight?: boolean;
  className?: string;
  focusSessionId?: string | null;
  accountScope?: string;
  documents: RagDocumentOption[];
  defaultTopK?: number;
  defaultPromptVariant?: "grounded_rule" | "no_rule";
};

const AUTO_SCROLL_THRESHOLD_PX = 100;
const DEFAULT_SOFT_TURN_LIMIT = 18;
const DEFAULT_HARD_TURN_LIMIT = 24;

function isNearChatBottom(container: HTMLDivElement) {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <=
    AUTO_SCROLL_THRESHOLD_PX
  );
}

export function RagStudyAssistant({
  compact = false,
  fillHeight = false,
  className,
  focusSessionId,
  accountScope,
  documents,
  defaultTopK,
  defaultPromptVariant,
}: RagStudyAssistantProps) {
  const locale = useLocale();
  const t = useTranslations("rag");
  const [question, setQuestion] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [viewingHistory, setViewingHistory] = useState<RagHistoryDetail | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [topK, setTopK] = useState(defaultTopK ?? 5);

  const [promptVariant, setPromptVariant] = useState<
    "grounded_rule" | "no_rule"
  >(defaultPromptVariant ?? "grounded_rule");
  const [isRestoring, setIsRestoring] = useState(Boolean(focusSessionId));

  const [restoreFailed, setRestoreFailed] = useState(false);

  const [conversationV2, setConversationV2] = useState(false);

  const [completedTurnCount, setCompletedTurnCount] = useState(0);
  const [contextMetadata, setContextMetadata] = useState<RagContextMetadata | null>(null);
  const [softTurnLimit, setSoftTurnLimit] = useState(DEFAULT_SOFT_TURN_LIMIT);
  const [hardTurnLimit, setHardTurnLimit] = useState(DEFAULT_HARD_TURN_LIMIT);
  const [serverTurnLimitReached, setServerTurnLimitReached] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRagRequest | null>(null);
  const [newChatEnabled, setNewChatEnabled] = useState(false);
  const [handoffEnabled, setHandoffEnabled] = useState(false);
  const [hasHandoff, setHasHandoff] = useState(false);
  const [contentAvailable, setContentAvailable] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [pendingNewChat, setPendingNewChat] = useState<RagNewChatPayload | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<RagConversationListItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<RagHistoryCursor | null>(null);

  const requestInFlightRef = useRef(false);
  const transitionInFlightRef = useRef(false);
  const historyInFlightRef = useRef(false);
  const conversationEpochRef = useRef(0);
  const restoreCallRef = useRef<object | null>(null);
  const pendingAskRef = useRef<PendingRagRequest | null>(null);
  const defaultsRef = useRef({ topK: defaultTopK ?? 5, promptVariant: defaultPromptVariant ?? "grounded_rule" });
  const [recoveryEnabled, setRecoveryEnabled] = useState(false);
  const [recoveryRestored, setRecoveryRestored] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    defaultsRef.current = { topK: defaultTopK ?? 5, promptVariant: defaultPromptVariant ?? "grounded_rule" };
  }, [defaultTopK, defaultPromptVariant]);

  const applyActiveConversation = useCallback((data: RagConversationRestoreResponse) => {
    conversationEpochRef.current += 1;
    setConversationV2(data.enabled);
    setRecoveryEnabled(Boolean(data.recovery_enabled));
    setNewChatEnabled(Boolean(data.new_chat_enabled));
    setHandoffEnabled(Boolean(data.handoff_enabled));
    setHasHandoff(Boolean(data.has_handoff));
    setContentAvailable(data.content_available !== false);
    setViewingHistory(null);
    setRestoreFailed(false);
    setConversationError(null);
    setHistoryOpen(false);
    setContextMetadata(null);
    setServerTurnLimitReached(false);
    setActiveSessionId(data.enabled ? data.session_id : null);
    setCompletedTurnCount(data.enabled ? data.completed_turn_count : 0);
    setSoftTurnLimit(data.soft_turn_limit ?? DEFAULT_SOFT_TURN_LIMIT);
    setHardTurnLimit(data.hard_turn_limit ?? DEFAULT_HARD_TURN_LIMIT);
    setSelectedDocumentIds(data.enabled ? data.selected_document_ids : []);
    const persisted = data.enabled && data.session_id && data.content_available !== false;
    setTopK(persisted ? data.top_k : defaultsRef.current.topK);
    setPromptVariant(persisted ? data.prompt_variant : defaultsRef.current.promptVariant);
    setMessages(data.enabled ? data.messages.map(({ id, role, content, turn_id, turn_index }) => ({
      id, role, content, turnId: turn_id, turnIndex: turn_index,
    })) : []);
    shouldAutoScrollRef.current = true;
  }, []);

  const reconcileActiveConversation = useCallback(async (focusId: string, expectedEpoch: number, sourceId?: string) => {
    try {
      const result = await restoreRagConversationAction(focusId);
      if (expectedEpoch !== conversationEpochRef.current || !result.success || !result.data
        || (sourceId && result.data.session_id === sourceId)) return null;
      applyActiveConversation(result.data);
      return result.data;
    } catch {
      return null;
    }
  }, [applyActiveConversation]);

  const finishRecovery = useCallback((reference: RagRecoveryReference, status: "completed" | "failed" | "access_unavailable") => {
    const request = pendingAskRef.current;
    if (status !== "completed" && request?.clientRequestId === reference.clientRequestId) {
      setQuestion((current) => current || request.question);
    }
    if (reference.operation === "new_chat" && status === "completed") setQuestion("");
    pendingAskRef.current = null;
    setPendingRequest(null);
    setPendingNewChat(null);
    setRecoveryRestored(status === "completed");
  }, []);

  const {
    state: recoveryState, reference: recoveryReference, track: trackRecovery, clear: clearRecovery,
    check: checkRecovery, reset: resetRecovery, discover: discoverRecovery, setState: setRecoveryState,
  } = useRagOperationRecovery({
    accountScope, epoch: conversationEpochRef, restore: reconcileActiveConversation, onTerminal: finishRecovery,
  });

  const retryConversationRestore = useCallback(async () => {
    if (!focusSessionId || restoreCallRef.current) return;
    const call = {};
    restoreCallRef.current = call;
    const epoch = conversationEpochRef.current;
    setIsRestoring(true);
    try {
      const data = await reconcileActiveConversation(focusSessionId, epoch);
      if (restoreCallRef.current !== call) return;
      if (!data) {
        if (epoch === conversationEpochRef.current) setRestoreFailed(true);
        return;
      }
      discoverRecovery(focusSessionId, data);
    } finally {
      if (restoreCallRef.current === call) {
        restoreCallRef.current = null;
        setIsRestoring(false);
      }
    }
  }, [focusSessionId, reconcileActiveConversation, discoverRecovery]);

  const recoveryBlocksSubmission = ["checking", "processing", "unknown", "unavailable"].includes(recoveryState);
  const recoveryChecking = recoveryState === "checking" || recoveryState === "processing";
  const canDismissRecovery = recoveryState === "unknown" || recoveryState === "unavailable";

  const canAsk = useMemo(() => question.trim().length > 0, [question]);
  const lifecycleBusy = isCreatingChat || historyLoading || pendingNewChat !== null;
  const askUnavailable = isPending || isRestoring || restoreFailed || lifecycleBusy
    || viewingHistory !== null || !contentAvailable || newChatOpen;
  const requestDisabled = askUnavailable || recoveryBlocksSubmission;
  const isConversationLimitReached =
    serverTurnLimitReached || (conversationV2 && completedTurnCount >= hardTurnLimit);
  const conversationScopeLocked = conversationV2 && Boolean(activeSessionId);
  const newChatAvailable = newChatEnabled && Boolean(focusSessionId && activeSessionId);
  const lifecycleDisabled = isPending || isRestoring || lifecycleBusy || recoveryBlocksSubmission
    || pendingRequest !== null || newChatOpen;
  const visibleMessages = viewingHistory?.messages ?? messages;
  const documentSelectionDisabled =
    requestDisabled || conversationScopeLocked || pendingRequest !== null;

  function toggleDocument(documentId: string) {
    if (documentSelectionDisabled || requestInFlightRef.current) {
      return;
    }

    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  function trackRequest(
    operation: RagRecoveryReference["operation"], requestId: string, focusId: string | null, sessionId: string | null,
  ) {
    if (!recoveryEnabled || !focusId) return null;
    setRecoveryRestored(false);
    return trackRecovery({
      version: 1, protocol: "rag-v2", operation, clientRequestId: requestId, focusSessionId: focusId,
      sessionId, createdAt: Date.now(),
    });
  }

  async function restoreAfterConflict(focusId: string, epoch: number, code: string, discoverPending = true) {
    const data = await reconcileActiveConversation(focusId, epoch);
    if (data) {
      if (discoverPending) discoverRecovery(focusId, data);
      setConversationError(t(CONFIG_CHANGED_CODES.has(code) ? "ragVersionChanged" : "sessionChanged"));
    } else if (epoch === conversationEpochRef.current) {
      setRestoreFailed(true);
    }
  }

  function handleAsk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuestion = question.trim();

    if (
      !cleanQuestion || pendingRequest || requestDisabled || isConversationLimitReached
      || requestInFlightRef.current || transitionInFlightRef.current || historyInFlightRef.current
    ) return;

    const request: PendingRagRequest = {
      clientRequestId: crypto.randomUUID(),
      question: cleanQuestion,
      sessionId: activeSessionId,
      focusSessionId: focusSessionId ?? null,
      selectedDocumentIds: [...selectedDocumentIds],
      topK,
      promptVariant,
      preferredLocale: locale === "vi" ? "vi" : "en",
      conversationProtocol: focusSessionId ? (conversationV2 ? "v2" : "legacy") : undefined,
    };
    const reference = request.conversationProtocol === "v2"
      ? trackRequest("ask", request.clientRequestId, request.focusSessionId, request.sessionId) : null;
    setMessages((current) => [
      ...current,
      { id: request.clientRequestId, role: "user", content: request.question },
    ]);
    setQuestion("");
    sendRequest(request, reference);
  }

  function sendRequest(request: PendingRagRequest, reference: RagRecoveryReference | null, retrying = false) {
    if (askUnavailable || recoveryChecking || requestInFlightRef.current
      || transitionInFlightRef.current || historyInFlightRef.current) return;

    requestInFlightRef.current = true;
    const epoch = conversationEpochRef.current;
    pendingAskRef.current = request;
    setPendingRequest(request);
    setConversationError(null);

    startTransition(async () => {
      try {
        const result = await askRagQuestionAction(request);
        if (epoch !== conversationEpochRef.current) return;

        if (!result.success) {
          const errorKey = result.code ? REQUEST_ERROR_MESSAGES.get(result.code) : undefined;
          const canonicalCode = result.code && CANONICAL_RESTORE_CODES.has(result.code) ? result.code : null;
          setConversationError(errorKey ? t(errorKey) : result.message);
          if (result.code === "RAG_CONVERSATION_LIMIT_REACHED") {
            setServerTurnLimitReached(true);
          }

          if (!result.retrySameRequest) {
            if (retrying && reference && canonicalCode && request.focusSessionId && result.outcome !== "failed") {
              await checkRecovery(reference);
              if (epoch === conversationEpochRef.current) {
                await restoreAfterConflict(request.focusSessionId, epoch, canonicalCode, false);
              }
              return;
            }
            if (reference) clearRecovery(reference);
            if (result.sessionId && (!activeSessionId || activeSessionId === result.sessionId)) {
              setActiveSessionId(result.sessionId);
              setConversationV2(true);
            }

            setPendingRequest(null);
            pendingAskRef.current = null;
            setMessages((current) =>
              current.filter((message) => message.id !== request.clientRequestId),
            );
            setQuestion((current) => current || request.question);
            if (request.focusSessionId && canonicalCode) {
              await restoreAfterConflict(request.focusSessionId, epoch, canonicalCode);
            }
          } else if (reference) {
            await checkRecovery(reference);
          }

          return;
        }

        const { data } = result;
        if (!data) {
          setConversationError(t("requestOutcomeUnknown"));
          if (reference) await checkRecovery(reference);
          return;
        }

        const differentSession = Boolean(activeSessionId && data.session_id !== activeSessionId);
        if (differentSession && !request.focusSessionId) {
          pendingAskRef.current = null;
          setPendingRequest(null);
          setMessages((current) => current.filter((message) => message.id !== request.clientRequestId));
          setConversationError(t("sessionChanged"));
          return;
        }
        const hasGap = typeof data.completed_turn_count === "number" && data.completed_turn_count > completedTurnCount + 1;
        const olderReplay = typeof data.completed_turn_count === "number" && data.completed_turn_count <= completedTurnCount;
        if (request.focusSessionId && (differentSession || (data.turn_id && (retrying || hasGap || olderReplay)))) {
          const restored = await reconcileActiveConversation(request.focusSessionId, epoch);
          if (restored) {
            if (reference) clearRecovery(reference);
            pendingAskRef.current = null;
            setPendingRequest(null);
            discoverRecovery(request.focusSessionId, restored);
            return;
          }
          if (epoch !== conversationEpochRef.current) return;
          if (reference || differentSession) {
            if (reference) setRecoveryState("unavailable");
            else {
              pendingAskRef.current = null;
              setPendingRequest(null);
              setMessages((current) => current.filter((message) => message.id !== request.clientRequestId));
              setRestoreFailed(true);
            }
            setConversationError(t("requestOutcomeUnknown"));
            return;
          }
        }

        setPendingRequest(null);
        pendingAskRef.current = null;
        if (reference) clearRecovery(reference);
        setActiveSessionId(data.session_id);
        if (!olderReplay) setContextMetadata(data.context ?? null);
        if (typeof data.soft_turn_limit === "number") setSoftTurnLimit(data.soft_turn_limit);
        if (typeof data.hard_turn_limit === "number") setHardTurnLimit(data.hard_turn_limit);

        if (typeof data.completed_turn_count === "number") {
          const count = data.completed_turn_count;
          setCompletedTurnCount((current) => Math.max(current, count));
          setConversationV2(true);
        }

        setMessages((current) => {
          if (data.turn_id && current.some((message) => message.turnId === data.turn_id && message.role === "assistant")) {
            return current.filter((message) => message.id !== request.clientRequestId);
          }
          const turnId = data.turn_id ?? undefined;
          const turnIndex = data.turn_index ?? undefined;
          const updated = current.map((message) => message.id === request.clientRequestId
            ? { ...message, turnId, turnIndex } : message);
          return [...updated, {
            id: turnId ? `${turnId}:assistant` : crypto.randomUUID(),
            turnId,
            turnIndex,
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            latencyMs: data.latency_ms,
            contextMode: data.context_mode,
            topK: data.top_k,
            promptVariant: data.prompt_variant,
          }];
        });
      } catch {
        if (epoch === conversationEpochRef.current) {
          setConversationError(t("requestOutcomeUnknown"));
          if (reference) await checkRecovery(reference);
        }
      } finally {
        requestInFlightRef.current = false;
      }
    });
  }

  async function submitNewChat(request: RagNewChatPayload) {
    if (recoveryChecking || transitionInFlightRef.current || requestInFlightRef.current || historyInFlightRef.current) return;
    transitionInFlightRef.current = true;
    const epoch = conversationEpochRef.current;
    const retrying = pendingNewChat?.clientRequestId === request.clientRequestId;
    const reference = trackRequest("new_chat", request.clientRequestId, request.focusSessionId, request.sourceSessionId);
    setIsCreatingChat(true);
    setNewChatOpen(false);
    setHistoryOpen(false);
    setPendingNewChat(request);
    setConversationError(null);
    try {
      const result = await startNewRagConversationAction(request);
      if (epoch !== conversationEpochRef.current) return;
      if (!result.success) {
        const key = result.code ? TRANSITION_ERROR_MESSAGES.get(result.code) : undefined;
        const canonicalCode = result.code && CANONICAL_RESTORE_CODES.has(result.code) ? result.code : null;
        setConversationError(t(key ?? (result.retrySameRequest ? "newChatOutcomeUnknown" : "newChatUnavailable")));
        if (!result.retrySameRequest) {
          if (retrying && reference && canonicalCode) {
            await checkRecovery(reference);
            if (epoch === conversationEpochRef.current) {
              await restoreAfterConflict(request.focusSessionId, epoch, canonicalCode, false);
            }
            return;
          }
          setPendingNewChat(null);
          if (reference) clearRecovery(reference);
          if (canonicalCode) {
            await restoreAfterConflict(request.focusSessionId, epoch, canonicalCode);
          }
        } else if (reference) {
          await checkRecovery(reference);
        }
        return;
      }
      const restored = await reconcileActiveConversation(request.focusSessionId, epoch, request.sourceSessionId);
      if (!restored) {
        if (epoch === conversationEpochRef.current) {
          setConversationError(t("newChatOutcomeUnknown"));
          if (reference) setRecoveryState("unavailable");
        }
        return;
      }
      if (reference) clearRecovery(reference);
      discoverRecovery(request.focusSessionId, restored);
      setPendingNewChat(null);
      setPendingRequest(null);
      setQuestion("");
    } catch {
      if (epoch === conversationEpochRef.current) {
        setConversationError(t("newChatOutcomeUnknown"));
        if (reference) await checkRecovery(reference);
      }
    } finally {
      transitionInFlightRef.current = false;
      setIsCreatingChat(false);
    }
  }

  function confirmNewChat(input: Pick<RagNewChatPayload, "mode" | "selectedDocumentIds">) {
    if (!focusSessionId || !activeSessionId || !newChatEnabled || pendingNewChat || pendingRequest || recoveryBlocksSubmission
      || transitionInFlightRef.current || requestInFlightRef.current || historyInFlightRef.current) return;
    void submitNewChat({
      ...input, focusSessionId, sourceSessionId: activeSessionId,
      clientRequestId: crypto.randomUUID(), topK, promptVariant,
      preferredLocale: locale === "vi" ? "vi" : "en",
    });
  }

  function dismissRecovery() {
    if (!recoveryReference || !canDismissRecovery || isPending || isCreatingChat || isRestoring
      || !window.confirm(t("dismissRecoveryConfirmation"))) return;
    const requestId = recoveryReference.clientRequestId;
    if (pendingAskRef.current?.clientRequestId === requestId) {
      const draft = pendingAskRef.current.question;
      setQuestion((current) => current || draft);
    }
    pendingAskRef.current = null;
    setMessages((current) => current.filter((message) => message.id !== requestId));
    setPendingRequest(null);
    setPendingNewChat(null);
    setConversationError(null);
    clearRecovery(recoveryReference);
  }

  async function loadHistoryPage(cursor: RagHistoryCursor | null = null) {
    if (!focusSessionId || recoveryBlocksSubmission || historyInFlightRef.current || transitionInFlightRef.current
      || requestInFlightRef.current || pendingNewChat) return;
    historyInFlightRef.current = true;
    const epoch = conversationEpochRef.current;
    setHistoryLoading(true);
    try {
      const result = await listRagConversationsAction(focusSessionId, cursor);
      if (epoch !== conversationEpochRef.current) return;
      if (!result.success) {
        setConversationError(t("historyUnavailable"));
        return;
      }
      setHistoryItems((current) => cursor ? [...current, ...result.data.conversations] : result.data.conversations);
      setHistoryCursor(result.data.next_cursor);
    } catch {
      if (epoch === conversationEpochRef.current) setConversationError(t("historyUnavailable"));
    } finally {
      historyInFlightRef.current = false;
      setHistoryLoading(false);
    }
  }

  async function viewConversation(item?: RagConversationListItem) {
    if (!focusSessionId || recoveryBlocksSubmission || historyInFlightRef.current || transitionInFlightRef.current
      || requestInFlightRef.current || pendingNewChat || pendingRequest) return;
    historyInFlightRef.current = true;
    const epoch = conversationEpochRef.current;
    setHistoryOpen(false);
    setHistoryLoading(true);
    try {
      if (!item || item.status === "active") {
        const data = await reconcileActiveConversation(focusSessionId, epoch);
        if (!data) {
          if (epoch === conversationEpochRef.current) setConversationError(t("restoreFailed"));
          return;
        }
        if (data.session_id !== activeSessionId) setQuestion("");
        discoverRecovery(focusSessionId, data);
      } else {
        const result = await restoreRagHistoryAction(focusSessionId, item.id);
        if (epoch !== conversationEpochRef.current) return;
        if (!result.success || !result.data.read_only || result.data.session_id !== item.id) {
          setConversationError(t("historyAccessUnavailable"));
          return;
        }
        conversationEpochRef.current += 1;
        shouldAutoScrollRef.current = true;
        setViewingHistory(result.data);
        setConversationError(null);
      }
    } catch {
      if (epoch === conversationEpochRef.current) setConversationError(t("historyUnavailable"));
    } finally {
      historyInFlightRef.current = false;
      setHistoryLoading(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      if (isPending) return;

      formRef.current?.requestSubmit();
    }
  };

  function handleChatScroll() {
    const container = chatContainerRef.current;
    if (!container || visibleMessages.length === 0) return;

    shouldAutoScrollRef.current = isNearChatBottom(container);
  }

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    // Tính toán khoảng cách từ chỗ người dùng đang đứng tới đáy thực tế của hộp thoại
    const isNearBottom = shouldAutoScrollRef.current;

    // Chỉ cuộn xuống nếu người dùng đang chủ động ở sát đáy chat
    if (isNearBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
      shouldAutoScrollRef.current = true;
    }
  }, [visibleMessages]);

  useEffect(() => {
    setActiveSessionId(null);
    setQuestion("");
    setViewingHistory(null);
    setNewChatEnabled(false);
    setHandoffEnabled(false);
    setHasHandoff(false);
    setContentAvailable(true);
    setNewChatOpen(false);
    setHistoryOpen(false);
    setHistoryItems([]);
    setHistoryCursor(null);
    setPendingNewChat(null);
    setMessages([]);
    setSelectedDocumentIds([]);
    setCompletedTurnCount(0);
    setContextMetadata(null);
    setSoftTurnLimit(DEFAULT_SOFT_TURN_LIMIT);
    setHardTurnLimit(DEFAULT_HARD_TURN_LIMIT);
    setServerTurnLimitReached(false);
    setConversationV2(false);
    setRecoveryEnabled(false);
    setRecoveryRestored(false);
    setConversationError(null);
    setPendingRequest(null);
    pendingAskRef.current = null;
    setRestoreFailed(false);
    setTopK(defaultsRef.current.topK);
    setPromptVariant(defaultsRef.current.promptVariant);
    resetRecovery();
    if (focusSessionId) void retryConversationRestore();
    else setIsRestoring(false);

    return () => {
      restoreCallRef.current = null;
      conversationEpochRef.current += 1;
    };
  }, [focusSessionId, accountScope, resetRecovery, retryConversationRestore]);

  return (
    <section
      className={cn(
        "min-w-0 max-w-full rounded-2xl h-fit border bg-background p-5 shadow-sm",
        fillHeight && "flex h-full min-h-0 flex-col overflow-hidden",
        className,
      )}
    >
      {fillHeight && (
        <h3 className="shrink-0 border-b border-border pb-2 text-label font-semibold">
          {t("ragTitle")}
        </h3>
      )}
      {isRestoring ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {t("restoringConversation")}
        </p>
      ) : conversationScopeLocked && contentAvailable && !viewingHistory && (
        <RagContextIndicator
          completedTurnCount={completedTurnCount}
          softTurnLimit={softTurnLimit}
          hardTurnLimit={hardTurnLimit}
          context={contextMetadata}
          hasHandoff={hasHandoff}
          canStartNewChat={newChatAvailable}
        />
      )}

      {newChatEnabled && focusSessionId && (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {newChatAvailable && !viewingHistory && (
            <Button type="button" size="sm" variant={isConversationLimitReached ? "default" : "outline"}
              disabled={lifecycleDisabled} onClick={() => setNewChatOpen(true)}>
              {t("newChat")}
            </Button>
          )}
          <RagConversationHistory
            open={historyOpen}
            disabled={lifecycleDisabled && !historyLoading}
            loading={historyLoading}
            items={historyItems}
            cursor={historyCursor}
            viewingSessionId={viewingHistory?.session_id ?? activeSessionId}
            onOpenChange={(open) => {
              setHistoryOpen(open);
              if (open) void loadHistoryPage();
            }}
            onNextPage={(cursor) => void loadHistoryPage(cursor)}
            onSelect={(item) => void viewConversation(item)}
          />
          {viewingHistory && (
            <Button type="button" size="sm" variant="outline" disabled={lifecycleDisabled}
              onClick={() => void viewConversation()}>
              {t("returnToActiveConversation")}
            </Button>
          )}
        </div>
      )}
      {viewingHistory && <p role="status" className="mt-2 text-xs">{t("readOnlyConversation")}</p>}
      {!contentAvailable && !viewingHistory && (
        <p role="status" className="mt-2 text-xs">{t("historyAccessUnavailable")}</p>
      )}
      {isCreatingChat && <p role="status" className="mt-2 text-xs">{t("creatingConversation")}</p>}
      {newChatOpen && (
        <RagNewChatDialog
          onOpenChange={setNewChatOpen}
          handoffEnabled={handoffEnabled}
          canContinueContext={contentAvailable && (completedTurnCount > 0 || hasHandoff)}
          selectedDocumentIds={selectedDocumentIds}
          documents={documents}
          isSubmitting={isCreatingChat}
          onConfirm={confirmNewChat}
        />
      )}

      <div
        ref={chatContainerRef}
        onScroll={handleChatScroll}
        className={cn(
          "mt-5 min-w-0 max-w-full scroll-smooth h-96 space-y-4 rounded-2xl overflow-x-hidden overflow-y-scroll",
          compact && "mt-3 h-64 rounded-md",
          fillHeight &&
            "h-auto min-h-0 flex-1 overflow-y-auto overscroll-contain",
        )}
      >
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col h-full gap-4 items-center justify-center text-center">
            {!fillHeight && (
              <p
                className={cn(
                  "text-sm font-medium uppercase tracking-wide text-muted-foreground",
                  compact && "text-caption tracking-normal",
                )}
              >
                {t("ragTitle")}
              </p>
            )}
            <p
              className={cn(
                "max-w-md text-3xl text-muted-foreground",
                compact && "text-section text-secondary-text",
              )}
            >
              {t("emptyPrompt")}
            </p>
          </div>
        ) : (
          visibleMessages.map((message) => (
            <article
              key={message.id}
              className={cn(
                "min-w-0 max-w-full rounded-2xl p-4",
                message.role === "user" && "border bg-background",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {message.role === "user" ? t("you") : t("assistant")}
              </p>

              {message.role === "assistant" ? (
                <RagMarkdownMessage
                  className="mt-2"
                  content={message.content}
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-foreground">
                  {message.content}
                </p>
              )}

              {/* {message.latencyMs ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Latency: {message.latencyMs}ms
                </p>
              ) : null}

              {message.contextMode ? (
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Mode: {message.contextMode}
                  {message.contextMode === "document_rag"
                    ? ` · top-k: ${message.topK} · prompt: ${message.promptVariant}`
                    : ""}
                </p>
              ) : null} */}

              {/* {message.sources && message.sources.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Retrieved sources
                  </p>

                  {message.sources.map((source, index) => (
                    <details
                      key={source.chunk_id}
                      className="rounded-xl border bg-white p-3 dark:border-neutral-700 dark:bg-neutral-950"
                    >
                      <summary className="cursor-pointer text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        Source {index + 1}: {source.file_name} · chunk{" "}
                        {source.chunk_index} · similarity{" "}
                        {source.similarity.toFixed(3)}
                      </summary>

                      <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-neutral-600 dark:text-neutral-400">
                        {source.content}
                      </p>
                    </details>
                  ))}
                </div>
              ) : null} */}
            </article>
          ))
        )}
      </div>

      <form
        ref={formRef}
        onSubmit={handleAsk}
        className={cn(
          "mt-4 flex flex-col gap-3",
          fillHeight && "mt-2 shrink-0 gap-2 border-t border-border pt-2",
        )}
      >
        {(conversationError || restoreFailed) && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 p-2 text-sm">
            <p role="alert" className="min-w-0 wrap-anywhere text-destructive">
              {conversationError ?? t("restoreFailed")}
            </p>
            {pendingRequest && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={askUnavailable || recoveryChecking}
                onClick={() => sendRequest(pendingRequest, recoveryReference, true)}
              >
                {t("retryRequest")}
              </Button>
            )}
            {pendingNewChat && (
              <Button type="button" variant="outline" size="sm" disabled={isCreatingChat || recoveryChecking || isRestoring}
                onClick={() => void submitNewChat(pendingNewChat)}>
                {t("retryRequest")}
              </Button>
            )}
            {restoreFailed && (
              <Button type="button" variant="outline" size="sm" disabled={isRestoring}
                onClick={() => void retryConversationRestore()}>
                {t("retryRestore")}
              </Button>
            )}
          </div>
        )}
        {recoveryRestored && <p role="status" className="text-xs">{t("conversationReconciled")}</p>}
        {recoveryState !== "idle" && (
          <div role="status" className="space-y-2 rounded-md border p-2 text-xs">
            <p>{t({
              checking: "recoveringRequest", processing: "requestStillProcessing",
              unknown: "recoveryUnknown", unavailable: "recoveryUnavailable",
              failed: "recoveryFailed", access_unavailable: "historyAccessUnavailable",
            }[recoveryState])}</p>
            {recoveryReference && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline"
                  disabled={recoveryState === "checking" || isRestoring || isPending || isCreatingChat}
                  onClick={() => void checkRecovery(recoveryReference)}>
                  {t("checkRequestStatus")}
                </Button>
                {canDismissRecovery && (
                  <>
                    <Button type="button" size="sm" variant="outline" disabled={isRestoring || isCreatingChat || isPending}
                      onClick={() => void retryConversationRestore()}>{t("restoreCurrentConversation")}</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={isRestoring || isCreatingChat || isPending}
                      onClick={dismissRecovery}>{t("dismissRecovery")}</Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-w-full text-caption"
              >
                <Plus size={12} aria-hidden="true" /> {t("chooseDocuments")}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="max-h-[60dvh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <PopoverHeader>
                <PopoverTitle>
                  <div className="flex justify-between">
                    <span>{t("documentContext")}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">
                      {selectedDocumentIds.length === 0
                        ? t("generalAi")
                        : t("selectedCount", {
                            count: selectedDocumentIds.length,
                          })}
                    </span>
                  </div>
                </PopoverTitle>
                <PopoverDescription>
                  {t(conversationScopeLocked ? "conversationScopeLocked" : "documentDescription")}
                </PopoverDescription>
              </PopoverHeader>
              {documents.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                  {t("noDocuments")}
                </p>
              ) : (
                <div className="mt-4 grid gap-2">
                  {documents.map((document) => {
                    const checked = selectedDocumentIds.includes(document.id);

                    return (
                      <Label
                        key={document.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition ${
                          checked
                            ? "border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-950"
                            : "bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={documentSelectionDisabled}
                          onChange={() => toggleDocument(document.id)}
                          className="h-4 w-4"
                        />

                        <div>
                          <p className="font-medium text-neutral-900 dark:text-neutral-50">
                            {document.file_name}
                          </p>

                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {t("documentStatus", {
                              visibility: t(
                                `visibility.${document.visibility}`,
                              ),
                            })}
                          </p>
                        </div>
                      </Label>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className={cn("flex gap-4", compact && "items-end gap-2")}>
          <Textarea
            rows={fillHeight ? 2 : undefined}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("askPlaceholder")}
            aria-label={t("askPlaceholder")}
            disabled={viewingHistory !== null || !contentAvailable || pendingNewChat !== null || recoveryBlocksSubmission}
            onKeyDown={handleKeyDown}
            className={cn(
              "min-h-13 resize-none flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition",
              compact && "min-h-touch rounded-md py-2 text-base md:text-body",
              fillHeight && "max-h-28 overflow-y-auto",
            )}
          />

          <Button
            type="submit"
            disabled={!canAsk || requestDisabled || pendingRequest !== null || isConversationLimitReached}
            className={cn(
              "bg-primary text-foreground px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
              compact &&
                "h-touch px-3 text-primary-foreground sm:h-touch lg:h-control",
            )}
          >
            {isPending ? t("thinking") : t("ask")}
          </Button>
        </div>
      </form>
    </section>
  );
}
