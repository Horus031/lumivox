import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
const mocks = vi.hoisted(() => ({ ask: vi.fn(), restore: vi.fn() }));
vi.mock("../rag-chat.actions", () => ({
  askRagQuestionAction: mocks.ask,
  restoreRagConversationAction: mocks.restore,
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

  async function renderAssistant(focusSessionId = "focus-session") {
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <RagStudyAssistant
            compact
            fillHeight
            focusSessionId={focusSessionId}
            documents={[{ id: "document", file_name: "Study notes.pdf", visibility: "private" }]}
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
});
