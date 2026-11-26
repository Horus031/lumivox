"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  askRagQuestionAction,
  restoreRagConversationAction,
  type RagSourceChunk,
} from "@/features/rag/rag-chat.actions";
import { RagMarkdownMessage } from "@/features/rag/components/rag-markdown-message";
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
};

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
]);

type RagStudyAssistantProps = {
  compact?: boolean;
  fillHeight?: boolean;
  className?: string;
  focusSessionId?: string | null;
  documents: RagDocumentOption[];
  defaultTopK?: number;
  defaultPromptVariant?: "grounded_rule" | "no_rule";
};

const AUTO_SCROLL_THRESHOLD_PX = 100;

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
  documents,
  defaultTopK,
  defaultPromptVariant,
}: RagStudyAssistantProps) {
  const locale = useLocale();
  const t = useTranslations("rag");
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [topK, setTopK] = useState(defaultTopK ?? 5);

  const [promptVariant, setPromptVariant] = useState<
    "grounded_rule" | "no_rule"
  >(defaultPromptVariant ?? "grounded_rule");
  const [isRestoring, setIsRestoring] = useState(Boolean(focusSessionId));

  const [restoreFailed, setRestoreFailed] = useState(false);

  const [conversationV2, setConversationV2] = useState(false);

  const [completedTurnCount, setCompletedTurnCount] = useState(0);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRagRequest | null>(null);

  const requestInFlightRef = useRef(false);
  const conversationEpochRef = useRef(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const canAsk = useMemo(() => question.trim().length > 0, [question]);
  const requestDisabled = isPending || isRestoring || restoreFailed;
  const conversationScopeLocked = conversationV2 && Boolean(sessionId);
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

  function handleAsk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanQuestion = question.trim();

    if (!cleanQuestion || pendingRequest || requestDisabled || requestInFlightRef.current) return;

    const request: PendingRagRequest = {
      clientRequestId: crypto.randomUUID(),
      question: cleanQuestion,
      sessionId,
      focusSessionId: focusSessionId ?? null,
      selectedDocumentIds: [...selectedDocumentIds],
      topK,
      promptVariant,
      preferredLocale: locale === "vi" ? "vi" : "en",
    };
    setMessages((current) => [
      ...current,
      { id: request.clientRequestId, role: "user", content: request.question },
    ]);
    setQuestion("");
    sendRequest(request);
  }

  function sendRequest(request: PendingRagRequest) {
    if (requestDisabled || requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    const epoch = conversationEpochRef.current;
    setPendingRequest(request);
    setConversationError(null);

    startTransition(async () => {
      try {
        const result = await askRagQuestionAction(request);
        if (epoch !== conversationEpochRef.current) return;

        if (!result.success) {
          const errorKey = result.code ? REQUEST_ERROR_MESSAGES.get(result.code) : undefined;
          setConversationError(errorKey ? t(errorKey) : result.message);

          if (!result.retrySameRequest) {
            if (result.sessionId) {
              setSessionId(result.sessionId);
              setConversationV2(true);
            }

            setPendingRequest(null);
            setMessages((current) =>
              current.filter((message) => message.id !== request.clientRequestId),
            );
            setQuestion((current) => current || request.question);
          }

          return;
        }

        const { data } = result;
        if (!data) {
          setConversationError(t("requestOutcomeUnknown"));
          return;
        }

        setPendingRequest(null);
        setSessionId(data.session_id);

        if (typeof data.completed_turn_count === "number") {
          setCompletedTurnCount(data.completed_turn_count);
          setConversationV2(true);
        }

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.answer,
            sources: data.sources,
            latencyMs: data.latency_ms,
            contextMode: data.context_mode,
            topK: data.top_k,
            promptVariant: data.prompt_variant,
          },
        ]);
      } catch {
        if (epoch === conversationEpochRef.current) {
          setConversationError(t("requestOutcomeUnknown"));
        }
      } finally {
        requestInFlightRef.current = false;
      }
    });
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
    if (!container || messages.length === 0) return;

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
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    setSessionId(null);
    setMessages([]);
    setSelectedDocumentIds([]);
    setCompletedTurnCount(0);
    setConversationV2(false);
    setConversationError(null);
    setPendingRequest(null);
    setRestoreFailed(false);
    setTopK(defaultTopK ?? 5);
    setPromptVariant(defaultPromptVariant ?? "grounded_rule");

    if (!focusSessionId) {
      setIsRestoring(false);

      return () => {
        cancelled = true;
        conversationEpochRef.current += 1;
      };
    }

    setIsRestoring(true);

    async function restore() {
      try {
        const result = await restoreRagConversationAction(focusSessionId!);

        if (cancelled) return;

        if (!result.success || !result.data) {
          setRestoreFailed(true);
          return;
        }

        const data = result.data;

        setConversationV2(data.enabled);

        if (!data.enabled) return;

        setSessionId(data.session_id);

        setCompletedTurnCount(data.completed_turn_count);

        setSelectedDocumentIds(data.selected_document_ids);

        setTopK(data.top_k);
        setPromptVariant(data.prompt_variant);

        setMessages(
          data.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          })),
        );
      } catch {
        if (!cancelled) {
          setRestoreFailed(true);
        }
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    }

    void restore();

    return () => {
      cancelled = true;
      conversationEpochRef.current += 1;
    };
  }, [focusSessionId, defaultTopK, defaultPromptVariant]);

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
      ) : conversationScopeLocked && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("conversationTurns", { count: completedTurnCount })}
        </p>
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
        {messages.length === 0 ? (
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
          messages.map((message) => (
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
                disabled={requestDisabled}
                onClick={() => sendRequest(pendingRequest)}
              >
                {t("retryRequest")}
              </Button>
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
            onKeyDown={handleKeyDown}
            className={cn(
              "min-h-13 resize-none flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition",
              compact && "min-h-touch rounded-md py-2 text-base md:text-body",
              fillHeight && "max-h-28 overflow-y-auto",
            )}
          />

          <Button
            type="submit"
            disabled={!canAsk || requestDisabled || pendingRequest !== null}
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
