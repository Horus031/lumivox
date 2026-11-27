import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import vietnamese from "@/messages/vi.json";
import { readRecoveryReference, writeRecoveryReference, type RagRecoveryReference } from "../lib/rag-recovery-journal";
const mocks = vi.hoisted(() => ({
  ask: vi.fn(), restore: vi.fn(), newChat: vi.fn(), history: vi.fn(), detail: vi.fn(), status: vi.fn(),
}));
vi.mock("../rag-chat.actions", () => ({
  askRagQuestionAction: mocks.ask,
  restoreRagConversationAction: mocks.restore,
  startNewRagConversationAction: mocks.newChat,
  listRagConversationsAction: mocks.history,
  restoreRagHistoryAction: mocks.detail,
  reconcileRagOperationAction: mocks.status,
}));
import { RagStudyAssistant } from "./rag-study-assistant";

const emptyConversation = {
  enabled: true,
  session_id: null,
  completed_turn_count: 0,
  selected_document_ids: [],
  top_k: 5,
  prompt_variant: "grounded_rule",
  messages: [],
};

function restoredConversation(question: string, answer: string) {
  return {
    success: true,
    data: {
      ...emptyConversation,
      session_id: "restored-session",
      completed_turn_count: 1,
      selected_document_ids: ["document"],
      messages: [
        { id: "restored-user", role: "user", content: question },
        { id: "restored-assistant", role: "assistant", content: answer },
      ],
    },
  };
}

describe("Study workspace RAG chat", () => {
  let root: Root;
  let container: HTMLDivElement;
  const previousScrollTo = HTMLDivElement.prototype.scrollTo;
  beforeEach(async () => {
    mocks.ask.mockReset();
    mocks.newChat.mockReset();
    mocks.history.mockReset();
    mocks.detail.mockReset();
    mocks.status.mockReset();
    sessionStorage.clear();
    mocks.restore.mockReset().mockResolvedValue({
      success: true,
      data: { ...emptyConversation, enabled: false },
    });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDivElement.prototype.scrollTo = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await renderAssistant();
  });

  async function renderAssistant(
    focusSessionId = "focus-session", locale: "en" | "vi" = "en",
    props?: { accountScope?: string; defaultTopK?: number; defaultPromptVariant?: "grounded_rule" | "no_rule" },
  ) {
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale={locale} messages={locale === "vi" ? vietnamese : messages} timeZone="UTC">
          <RagStudyAssistant
            compact
            fillHeight
            focusSessionId={focusSessionId}
            documents={[{ id: "document", file_name: "Study notes.pdf", visibility: "private" }]}
            {...props}
          />
        </NextIntlClientProvider>,
      ),
    );
  }
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    HTMLDivElement.prototype.scrollTo = previousScrollTo;
  });

  function enterQuestion(question: string) {
    const input = container.querySelector("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, question);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submitQuestion() {
    await act(async () =>
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  }

  function openDocumentSelector() {
    const select = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(messages.rag.chooseDocuments),
    )!;
    act(() => select.click());
    return document.body.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  }

  function retryButton() {
    return [...container.querySelectorAll("button")].find((button) =>
      button.textContent === messages.rag.retryRequest,
    );
  }

  it("opens the document selector without submitting the question", () => {
    openDocumentSelector();
    expect(document.body.textContent).toContain("Study notes.pdf");
    expect(mocks.ask).not.toHaveBeenCalled();
  });
  it("sends questions with focus context and renders the response inside the workspace", async () => {
    mocks.ask.mockResolvedValue({
      success: true,
      data: {
        session_id: "chat-session",
        answer: "Here is your study answer.",
        sources: [],
        context_mode: "general",
        top_k: 5,
        prompt_variant: "grounded_rule",
        latency_ms: 10,
      },
    });
    const input = container.querySelector("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        input,
        "Explain this concept",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(mocks.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Explain this concept",
        focusSessionId: "focus-session",
        preferredLocale: "en",
        clientRequestId: expect.stringMatching(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i),
      }),
    );
    expect(container.textContent).toContain("Here is your study answer.");
    expect(container.querySelector("textarea")).toBe(input);
    expect(openDocumentSelector().disabled).toBe(false);
  });

  it("renders a Markdown table returned by the RAG API", async () => {
    mocks.ask.mockResolvedValue({
      success: true,
      data: {
        session_id: "chat-session",
        answer: [
          "## Algorithm comparison",
          "",
          "| Algorithm | Complexity |",
          "| --- | --- |",
          "| Binary Search | O(log n) |",
          "| Linear Search | O(n) |",
        ].join("\n"),
        sources: [],
        context_mode: "general",
        top_k: 5,
        prompt_variant: "grounded_rule",
        latency_ms: 10,
      },
    });

    const input =
      container.querySelector("textarea")!;

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(
        input,
        "Compare search algorithms",
      );

      input.dispatchEvent(
        new Event("input", {
          bubbles: true,
        }),
      );
    });

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", {
            bubbles: true,
            cancelable: true,
          }),
        );
    });

    expect(
      container.querySelector("table"),
    ).not.toBeNull();

    expect(
      container.querySelectorAll(
        "tbody tr",
      ),
    ).toHaveLength(2);

    expect(
      container.querySelector(
        ".rag-table-scroll",
      ),
    ).not.toBeNull();

    expect(
      container.querySelector("textarea"),
    ).toBe(input);
  });

  it("retries an uncertain turn with the same payload and renders a completed replay once", async () => {
    const checkbox = openDocumentSelector();
    act(() => checkbox.click());
    mocks.ask
      .mockRejectedValueOnce(new Error("Network disconnected"))
      .mockResolvedValueOnce({
        success: false,
        code: "RAG_TURN_IN_PROGRESS",
        message: "Processing",
        retrySameRequest: true,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { session_id: "chat-session", answer: "Persisted answer", completed_turn_count: 1 },
      });

    enterQuestion("Explain binary search");
    await submitQuestion();
    const originalRequest = mocks.ask.mock.calls[0][0];
    expect(originalRequest).toMatchObject({
      question: "Explain binary search",
      sessionId: null,
      selectedDocumentIds: ["document"],
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.rag.requestOutcomeUnknown);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(checkbox.disabled).toBe(true);

    enterQuestion("Unrelated second question");
    await submitQuestion();
    expect(mocks.ask).toHaveBeenCalledTimes(1);

    await act(async () => retryButton()!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.rag.turnInProgress);
    await act(async () => retryButton()!.click());

    expect(mocks.ask.mock.calls).toEqual([[originalRequest], [originalRequest], [originalRequest]]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(container.textContent).toContain("Persisted answer");
    expect(checkbox.disabled).toBe(true);
  });

  it("allows a fresh request after a confirmed failure while keeping its v2 document scope locked", async () => {
    mocks.ask
      .mockResolvedValueOnce({
        success: false,
        code: "RAG_GENERATION_FAILED",
        message: "Generation failed",
        retrySameRequest: false,
        sessionId: "chat-session",
      })
      .mockResolvedValueOnce({
        success: true,
        data: { session_id: "chat-session", answer: "New answer", completed_turn_count: 1 },
      });

    enterQuestion("Explain binary search");
    await submitQuestion();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.rag.turnFailed);
    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(retryButton()).toBeUndefined();
    expect(openDocumentSelector().disabled).toBe(true);
    expect(container.querySelector("textarea")?.value).toBe("Explain binary search");

    await submitQuestion();
    const [original, resent] = mocks.ask.mock.calls.map(([request]) => request);
    expect(resent.clientRequestId).not.toBe(original.clientRequestId);
    expect(resent.sessionId).toBe("chat-session");
    expect(container.textContent).toContain("New answer");
  });

  it("shows a localized availability notice for provider throughput denials", async () => {
    mocks.ask.mockResolvedValueOnce({
      success: false,
      code: "RAG_PROVIDER_TPM_LIMITED",
      message: "Internal quota detail",
      retrySameRequest: false,
      sessionId: "chat-session",
    });

    enterQuestion("Explain binary search");
    await submitQuestion();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.rag.providerBusy);
    expect(retryButton()).toBeUndefined();
    expect(container.querySelector("textarea")?.value).toBe("Explain binary search");
  });

  it("restores messages in order and keeps the restored document scope fixed", async () => {
    mocks.restore.mockResolvedValueOnce(restoredConversation("Stored question", "**Stored answer**"));

    await renderAssistant("restored-focus");

    const articles = [...container.querySelectorAll("article")];
    expect(articles).toHaveLength(2);
    expect(articles[0].textContent).toContain("Stored question");
    expect(articles[1].querySelector("strong")?.textContent).toBe("Stored answer");
    expect(container.querySelector('[aria-label="1 completed turn"]')?.textContent).toMatch(/1\s*\/\s*24/);
    const checkbox = openDocumentSelector();
    expect(document.body.textContent).toContain(messages.rag.conversationScopeLocked);
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
    act(() => checkbox.click());
    expect(checkbox.checked).toBe(true);
  });

  it("shows the empty state for a restored V2 conversation with no turns", async () => {
    mocks.restore.mockResolvedValueOnce({ success: true, data: emptyConversation });

    await renderAssistant("empty-focus");

    expect(container.textContent).toContain(messages.rag.emptyPrompt);
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });

  it("blocks submissions during restore and after a restore failure", async () => {
    let finishRestore!: (response: { success: false; message: string }) => void;
    mocks.restore.mockReturnValueOnce(new Promise((resolve) => { finishRestore = resolve; }));

    await renderAssistant("unavailable-focus");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(messages.rag.restoringConversation);
    enterQuestion("Do not start a new conversation");
    await submitQuestion();
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

    await act(async () => finishRestore({ success: false, message: "Restore failed" }));
    await submitQuestion();
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.rag.restoreFailed);
    expect(openDocumentSelector().disabled).toBe(true);
  });

  it("blocks a second submission while a request is pending", async () => {
    let finishAsk!: (response: unknown) => void;
    mocks.ask.mockReturnValueOnce(new Promise((resolve) => { finishAsk = resolve; }));

    enterQuestion("First question");
    await submitQuestion();
    enterQuestion("Second question");
    await submitQuestion();

    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    await act(async () => finishAsk({
      success: true,
      data: { session_id: "new-session", answer: "Answer", completed_turn_count: 1 },
    }));
  });

  it("clears history on Focus Session change and ignores a late restore from the old focus", async () => {
    mocks.restore.mockResolvedValueOnce(restoredConversation("Old question", "Old answer"));
    await renderAssistant("old-focus");
    expect(container.textContent).toContain("Old answer");

    let finishOldRestore!: (response: ReturnType<typeof restoredConversation>) => void;
    mocks.restore.mockReturnValueOnce(new Promise((resolve) => { finishOldRestore = resolve; }));
    await renderAssistant("slow-focus");
    expect(container.textContent).not.toContain("Old answer");

    mocks.restore.mockResolvedValueOnce(restoredConversation("New question", "New answer"));
    await renderAssistant("new-focus");
    await act(async () => finishOldRestore(restoredConversation("Stale question", "Stale answer")));

    expect(container.textContent).toContain("New answer");
    expect(container.textContent).not.toContain("Old answer");
    expect(container.textContent).not.toContain("Stale answer");
  });

  it("shows the configured limits and context, then blocks a new turn at the hard limit", async () => {
    const restored = restoredConversation("Earlier question", "Earlier answer");
    mocks.restore.mockResolvedValueOnce({
      ...restored,
      data: { ...restored.data, completed_turn_count: 5, soft_turn_limit: 5, hard_turn_limit: 6 },
    });
    await renderAssistant("limited-focus");
    expect(container.textContent).toContain(messages.rag.conversationNearLimit);

    mocks.ask.mockRejectedValueOnce(new Error("Final response disconnected")).mockResolvedValueOnce({
      success: true,
      data: {
        session_id: "restored-session", answer: "Final answer", completed_turn_count: 6,
        soft_turn_limit: 5, hard_turn_limit: 6,
        context: {
          estimated_prompt_tokens: 900, history_turns_used: 2, retrieved_chunks_used: 1,
          context_truncated: true, retrieval_strategy: "history_augmented", generation_attempts: 1,
        },
      },
    });
    enterQuestion("Final question");
    await submitQuestion();
    await act(async () => retryButton()!.click());
    expect(mocks.ask.mock.calls[1][0]).toEqual(mocks.ask.mock.calls[0][0]);

    expect(container.textContent).toContain("Using 2 recent turns");
    expect(container.textContent).toContain(messages.rag.recentContextOnly);
    expect(container.textContent).toContain(messages.rag.conversationLimitReached);
    expect(container.textContent).not.toContain("900");
    enterQuestion("Blocked question");
    await submitQuestion();
    expect(mocks.ask).toHaveBeenCalledTimes(2);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });

  it("shows adaptive omission and condensation independently of the legacy notice", async () => {
    mocks.restore.mockResolvedValueOnce(restoredConversation("Earlier question", "Earlier answer"));
    await renderAssistant("adaptive-focus");
    mocks.ask.mockResolvedValueOnce({
      success: true,
      data: {
        session_id: "restored-session", answer: "Study answer", completed_turn_count: 6,
        context: {
          context_policy: "adaptive_v1", estimated_prompt_tokens: 909, history_turns_used: 2,
          omitted_history_turns: 1, truncated_history_turns: 1, retrieved_chunks_used: 0,
          context_truncated: true, retrieval_strategy: "none", summary_version_used: 1, summary_tokens_used: 60,
        },
      },
    });
    enterQuestion("Follow-up question");
    await submitQuestion();
    expect(container.textContent).toContain(messages.rag.someContextOmitted);
    expect(container.textContent).toContain(messages.rag.historyContentCondensed);
    expect(container.textContent).toContain(messages.rag.compressedMemoryActive);
    expect(container.textContent).not.toContain(messages.rag.recentContextOnly);
    expect(container.textContent).not.toContain("909");
  });

  it("blocks further submit after the server reports a concurrent turn limit", async () => {
    mocks.ask.mockResolvedValueOnce({
      success: false, code: "RAG_CONVERSATION_LIMIT_REACHED", message: "Limit reached",
      retrySameRequest: false,
    });
    enterQuestion("New question");
    await submitQuestion();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.rag.conversationLimitReached);
    await submitQuestion();
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(retryButton()).toBeUndefined();
  });

  it.each([
    { version: 1, tokens: 72, visible: true },
    { version: 1, tokens: 0, visible: false },
    { version: null, tokens: 72, visible: false },
  ])("shows summarized memory only when the answer used it ($version, $tokens)", async ({
    version, tokens, visible,
  }) => {
    mocks.ask.mockResolvedValueOnce({
      success: true,
      data: {
        session_id: "chat-session", answer: "Study answer", sources: [],
        completed_turn_count: 7, soft_turn_limit: 20, hard_turn_limit: 24,
        context: {
          estimated_prompt_tokens: 900, history_turns_used: 4, retrieved_chunks_used: 0,
          context_truncated: true, retrieval_strategy: "none", generation_attempts: 1,
          summary_version_used: version, summary_tokens_used: tokens,
          summary_covered_turn_index: 2, summary_generation_method: "extractive",
        },
      },
    });
    enterQuestion("Follow-up question");
    await submitQuestion();
    expect(container.textContent?.includes(messages.rag.compressedMemoryActive)).toBe(visible);
    expect(container.textContent).not.toContain("extractive");
  });

  const oldChat = restoredConversation("Previous question", "Previous answer");
  const capableChat = {
    ...oldChat,
    data: { ...oldChat.data, new_chat_enabled: true, handoff_enabled: true },
  };
  const newChatResult = {
    success: true, data: { source_session_id: "restored-session", target_session_id: "new-target",
      mode: "fresh", has_handoff: false },
  };
  const canonicalChat = {
    success: true,
    data: { ...emptyConversation, session_id: "canonical-target", new_chat_enabled: true, handoff_enabled: true },
  };

  function button(text: string, scope: ParentNode = container) {
    return [...scope.querySelectorAll("button")].find((item) => item.textContent?.trim() === text)!;
  }

  async function openNewChat() {
    await act(async () => button(messages.rag.newChat).click());
    return document.querySelector('[role="dialog"]')!;
  }

  it("reconciles a quarantine response, disables Ask and Continue, and keeps Fresh available", async () => {
    mocks.restore.mockResolvedValueOnce(capableChat).mockResolvedValueOnce({
      ...capableChat, data: { ...capableChat.data, memory_quarantined: true },
    }).mockResolvedValueOnce(canonicalChat);
    mocks.ask.mockResolvedValueOnce({
      success: false, code: "RAG_MEMORY_QUARANTINED", retrySameRequest: false, outcome: "failed",
      message: "private upstream diagnostic",
    });
    mocks.newChat.mockResolvedValueOnce(newChatResult);
    await renderAssistant("quarantined-focus");
    enterQuestion("Try to continue");
    await submitQuestion();
    expect(container.textContent).toContain(messages.rag.memoryQuarantined);
    expect(container.textContent).not.toContain("private upstream diagnostic");
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    const modal = await openNewChat();
    expect(modal.querySelectorAll('[role="radio"]')[1].hasAttribute("disabled")).toBe(true);
    expect(modal.textContent).toContain(messages.rag.memoryContinuationUnavailable);
    await act(async () => button(messages.rag.newChat, modal).click());
    expect(mocks.newChat.mock.calls[0][0]).toMatchObject({ mode: "fresh", selectedDocumentIds: [] });
    expect(container.querySelector("textarea")?.disabled).toBe(false);
  });

  it("keeps New Chat hidden when the backend capability is off", async () => {
    mocks.restore.mockResolvedValueOnce(oldChat);
    await renderAssistant("chat-disabled");
    expect(button(messages.rag.newChat)).toBeUndefined();
  });

  it("defaults fresh, guards double submit and restores canonical active instead of using replay target", async () => {
    mocks.restore.mockResolvedValueOnce(capableChat).mockResolvedValueOnce(canonicalChat);
    let settle!: (value: typeof newChatResult) => void;
    mocks.newChat.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    await renderAssistant("chat-active");
    const modal = await openNewChat();
    expect(modal.querySelectorAll('[role="radio"]')[0].getAttribute("aria-checked")).toBe("true");
    const submit = button(messages.rag.newChat, modal);
    await act(async () => { submit.click(); submit.click(); });
    const payload = mocks.newChat.mock.calls[0][0];
    expect(payload).toMatchObject({ mode: "fresh", selectedDocumentIds: [], sourceSessionId: "restored-session" });
    expect(mocks.newChat).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Previous answer");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await act(async () => settle(newChatResult));
    expect(container.textContent).not.toContain("Previous answer");
    expect(container.textContent).toContain("0/24");
    mocks.ask.mockResolvedValueOnce({ success: false, message: "synthetic", retrySameRequest: false });
    enterQuestion("Next question");
    await submitQuestion();
    expect(mocks.ask.mock.calls[0][0].sessionId).toBe("canonical-target");
  });

  it("retries an uncertain transition with the same request and preserves the old conversation until restore", async () => {
    mocks.restore.mockResolvedValueOnce(capableChat).mockResolvedValueOnce(canonicalChat);
    mocks.newChat.mockResolvedValueOnce({
      success: false, code: "AI_API_TIMEOUT", retrySameRequest: true, message: "synthetic timeout",
    }).mockResolvedValueOnce(newChatResult);
    await renderAssistant("chat-uncertain");
    const modal = await openNewChat();
    await act(async () => button(messages.rag.newChat, modal).click());
    expect(container.textContent).toContain("Previous answer");
    expect(container.textContent).toContain(messages.rag.newChatOutcomeUnknown);
    await act(async () => retryButton()!.click());
    expect(mocks.newChat.mock.calls[1][0]).toEqual(mocks.newChat.mock.calls[0][0]);
    expect(container.textContent).toContain("0/24");
  });

  it("keeps the old conversation after a determined rejection", async () => {
    mocks.restore.mockResolvedValueOnce(capableChat).mockResolvedValueOnce(capableChat);
    mocks.newChat.mockResolvedValueOnce({
      success: false, code: "RAG_HANDOFF_SOURCE_CHANGED", retrySameRequest: false, message: "fixture",
    });
    await renderAssistant("chat-conflict");
    const modal = await openNewChat();
    await act(async () => button(messages.rag.newChat, modal).click());
    expect(container.textContent).toContain("Previous answer");
    expect(container.textContent).toContain(messages.rag.sessionChanged);
    expect(retryButton()).toBeUndefined();
  });

  it("blocks New Chat while Ask is pending", async () => {
    mocks.restore.mockResolvedValueOnce(capableChat);
    let settle!: (value: unknown) => void;
    mocks.ask.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    await renderAssistant("chat-pending-ask");
    enterQuestion("Study question");
    await submitQuestion();
    expect(button(messages.rag.newChat).disabled).toBe(true);
    await act(async () => settle({ success: false, message: "fixture", retrySameRequest: false }));
    expect(button(messages.rag.newChat).disabled).toBe(false);
  });

  it("ignores a transition response after navigating away from its focus session", async () => {
    mocks.restore.mockClear();
    mocks.restore.mockResolvedValueOnce(capableChat)
      .mockResolvedValueOnce(restoredConversation("New focus question", "New focus answer"));
    let settle!: (value: typeof newChatResult) => void;
    mocks.newChat.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    await renderAssistant("first-focus");
    const modal = await openNewChat();
    await act(async () => button(messages.rag.newChat, modal).click());
    await renderAssistant("next-focus");
    await act(async () => settle(newChatResult));
    expect(container.textContent).toContain("New focus answer");
    expect(mocks.restore).toHaveBeenCalledTimes(2);
  });

  it("shows Vietnamese labels and keeps document scope for the opted-in continuation", async () => {
    mocks.restore.mockResolvedValueOnce(capableChat);
    mocks.newChat.mockResolvedValueOnce({ success: false, message: "fixture", retrySameRequest: false });
    await renderAssistant("chat-vietnamese", "vi");
    await act(async () => button(vietnamese.rag.newChat).click());
    const modal = document.querySelector('[role="dialog"]')!;
    const continueRadio = modal.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1];
    await act(async () => continueRadio.click());
    expect(modal.textContent).toContain(vietnamese.rag.continueWithContext);
    expect(modal.textContent).toContain(vietnamese.rag.conversationScopeLocked);
    await act(async () => button(vietnamese.rag.newChat, modal).click());
    expect(mocks.newChat.mock.calls[0][0]).toMatchObject({
      mode: "continue", selectedDocumentIds: ["document"], preferredLocale: "vi",
    });
  });

  it("uses a read-only transcript for a closed conversation and restores the active composer", async () => {
    mocks.restore.mockResolvedValueOnce(capableChat).mockResolvedValueOnce(capableChat);
    mocks.history.mockResolvedValueOnce({ success: true, data: { next_cursor: null, conversations: [{
      id: "older", status: "closed", title: "Private historical title", completed_turn_count: 1, content_available: true,
      created_at: "2026-11-27T08:00:00Z", updated_at: "2026-11-27T08:00:00Z",
    }] } });
    mocks.detail.mockResolvedValueOnce({ success: true, data: {
      session_id: "older", status: "closed", read_only: true, completed_turn_count: 1,
      messages: [{ id: "older-message", role: "assistant", content: "**Historical answer**" }],
    } });
    await renderAssistant("chat-history");
    await act(async () => button(messages.rag.conversationHistory).click());
    const row = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes(messages.rag.studyConversationTitle))!;
    expect(row.textContent).not.toContain("Private historical title");
    expect(row.querySelector("time")?.dateTime).toBe("2026-11-27T08:00:00Z");
    await act(async () => row.click());
    expect(container.querySelector("strong")?.textContent).toBe("Historical answer");
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    expect(container.textContent).toContain(messages.rag.readOnlyConversation);
    await act(async () => button(messages.rag.returnToActiveConversation).click());
    expect(container.textContent).toContain("Previous answer");
    expect(container.querySelector("textarea")?.disabled).toBe(false);
  });

  it.each([false, true])("offers New Chat at the limit or with a revoked source (revoked=%s)", async (revoked) => {
    mocks.restore.mockResolvedValueOnce({
      ...capableChat, data: { ...capableChat.data, completed_turn_count: 24, content_available: !revoked,
        messages: revoked ? [] : capableChat.data.messages },
    });
    await renderAssistant("chat-availability");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(button(messages.rag.newChat).disabled).toBe(false);
    const modal = await openNewChat();
    expect((modal.querySelectorAll('[role="radio"]')[1] as HTMLButtonElement).disabled).toBe(revoked);
    if (revoked) expect(container.textContent).toContain(messages.rag.historyAccessUnavailable);
  });

  const recoveryFocus = "f6100000-0000-4000-8000-000000000011";
  const recoverySession = "f6100000-0000-4000-8000-000000000041";
  const recoveryId = "f6110000-0000-4000-8000-000000000001";
  const recoveredChat = {
    ...capableChat,
    data: { ...capableChat.data, session_id: recoverySession, recovery_enabled: true },
  };
  const accountScope = "opaque-account";
  const recoveryProps = { accountScope };

  function savedReference(operation: "ask" | "new_chat"): RagRecoveryReference {
    return {
      version: 1, protocol: "rag-v2", operation, clientRequestId: recoveryId,
      focusSessionId: recoveryFocus, sessionId: recoverySession, createdAt: Date.now(),
    };
  }

  it("writes only the v2 Ask reference before the network call", async () => {
    mocks.restore.mockResolvedValueOnce(recoveredChat);
    mocks.ask.mockImplementationOnce(async (request) => {
      const stored = readRecoveryReference(accountScope, recoveryFocus);
      expect(stored).toMatchObject({ operation: "ask", clientRequestId: request.clientRequestId });
      expect(stored).not.toHaveProperty("question");
      expect(stored).not.toHaveProperty("selectedDocumentIds");
      return { success: false, message: "outcome unclear", code: "AI_API_TIMEOUT", retrySameRequest: true };
    });
    mocks.status.mockResolvedValueOnce({ success: true, data: { operation: "ask", status: "unknown" } });
    await renderAssistant(recoveryFocus, "en", recoveryProps);
    enterQuestion("A private draft");
    await submitQuestion();
    expect(mocks.ask.mock.calls[0][0].conversationProtocol).toBe("v2");
    expect(container.textContent).toContain(messages.rag.recoveryUnknown);
    expect(readRecoveryReference(accountScope, recoveryFocus)).not.toBeNull();
  });

  it.each(["ask", "new_chat"] as const)("recovers a completed %s after refresh without resubmitting", async (operation) => {
    writeRecoveryReference(accountScope, savedReference(operation));
    mocks.restore.mockResolvedValueOnce(recoveredChat).mockResolvedValueOnce({
      ...recoveredChat, data: { ...recoveredChat.data, messages: [
        { id: "canonical", role: "assistant", content: "Persisted canonical answer" },
      ] },
    });
    mocks.status.mockResolvedValueOnce({ success: true, data: { operation, status: "completed" } });
    await renderAssistant(recoveryFocus, "en", recoveryProps);
    expect(container.textContent).toContain("Persisted canonical answer");
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(mocks.newChat).not.toHaveBeenCalled();
    expect(readRecoveryReference(accountScope, recoveryFocus)).toBeNull();
  });

  it("discovers a live Ask from restore without browser storage", async () => {
    mocks.restore.mockResolvedValueOnce({ ...recoveredChat, data: { ...recoveredChat.data,
      pending_operation: { operation: "ask", status: "processing", client_request_id: recoveryId,
        lease_expires_at: new Date(Date.now() + 60_000).toISOString() },
    } });
    mocks.status.mockResolvedValueOnce({ success: true, data: { operation: "ask", status: "processing" } });
    await renderAssistant(recoveryFocus, "en", recoveryProps);
    expect(container.textContent).toContain(messages.rag.requestStillProcessing);
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("restores a stale session and preserves the draft without automatically asking again", async () => {
    mocks.restore.mockResolvedValueOnce(recoveredChat).mockResolvedValueOnce(canonicalChat);
    mocks.ask.mockResolvedValueOnce({ success: false, code: "RAG_SESSION_CLOSED", retrySameRequest: false });
    await renderAssistant(recoveryFocus, "en", recoveryProps);
    enterQuestion("Review this draft");
    await submitQuestion();
    expect(container.querySelector("textarea")?.value).toBe("Review this draft");
    expect(container.textContent).toContain(messages.rag.sessionChanged);
    expect(mocks.ask).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a restored assistant or regress the count on an older replay", async () => {
    mocks.restore.mockResolvedValueOnce({
      ...recoveredChat, data: {
        ...recoveredChat.data, recovery_enabled: false, completed_turn_count: 4, messages: [
          { id: "existing", role: "assistant", turn_id: "old-turn", turn_index: 1, content: "Existing answer" },
        ],
      },
    }).mockResolvedValueOnce({ success: false, message: "restore unavailable" });
    mocks.ask.mockResolvedValueOnce({ success: true, data: {
      session_id: recoverySession, turn_id: "old-turn", turn_index: 1,
      completed_turn_count: 1, answer: "Existing answer", sources: [],
    } });
    await renderAssistant(recoveryFocus, "en", recoveryProps);
    enterQuestion("Synthetic replay");
    await submitQuestion();
    expect(container.textContent).toContain("4/24");
    expect(container.textContent?.match(/Existing answer/g)).toHaveLength(1);
    expect(container.textContent).not.toContain("Synthetic replay");
  });

  it("retries failed restore and preserves configured defaults for an empty conversation", async () => {
    mocks.restore.mockResolvedValueOnce({ success: false, message: "initial timeout" })
      .mockResolvedValueOnce({ success: true, data: emptyConversation });
    mocks.ask.mockResolvedValueOnce({ success: false, message: "fixture", retrySameRequest: false });
    await renderAssistant(recoveryFocus, "en", { defaultTopK: 7, defaultPromptVariant: "no_rule" });
    await act(async () => button(messages.rag.retryRestore).click());
    enterQuestion("First question");
    await submitQuestion();
    expect(mocks.ask.mock.calls[0][0]).toMatchObject({
      topK: 7, promptVariant: "no_rule", conversationProtocol: "v2",
    });
    expect(container.textContent).not.toContain(messages.rag.restoreFailed);
  });

  it("reconciles a v2 request reference during flag rollback without legacy generation", async () => {
    writeRecoveryReference(accountScope, savedReference("ask"));
    const disabled = { success: true, data: { ...emptyConversation, enabled: false, recovery_enabled: true } };
    mocks.restore.mockResolvedValueOnce(disabled).mockResolvedValueOnce(disabled);
    mocks.status.mockResolvedValueOnce({ success: true, data: { operation: "ask", status: "completed" } });
    await renderAssistant(recoveryFocus, "en", recoveryProps);
    expect(container.textContent).toContain(messages.rag.conversationReconciled);
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(readRecoveryReference(accountScope, recoveryFocus)).toBeNull();
  });

  it("checks the original outcome when a v2 retry is rejected after rollback", async () => {
    const disabled = { success: true, data: { ...emptyConversation, enabled: false, recovery_enabled: true } };
    mocks.restore.mockResolvedValueOnce(recoveredChat).mockResolvedValueOnce(disabled);
    mocks.ask.mockResolvedValueOnce({ success: false, message: "timeout", retrySameRequest: true })
      .mockResolvedValueOnce({ success: false, code: "RAG_V2_DISABLED", retrySameRequest: false });
    mocks.status.mockResolvedValueOnce({ success: true, data: { operation: "ask", status: "unknown" } })
      .mockResolvedValueOnce({ success: true, data: { operation: "ask", status: "completed" } });
    await renderAssistant(recoveryFocus, "en", recoveryProps);
    enterQuestion("In-flight v2 question");
    await submitQuestion();
    await act(async () => retryButton()!.click());
    expect(mocks.ask.mock.calls[1][0]).toEqual(mocks.ask.mock.calls[0][0]);
    expect(mocks.status).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(messages.rag.conversationReconciled);
    expect(readRecoveryReference(accountScope, recoveryFocus)).toBeNull();
  });
});
