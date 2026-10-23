import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
const mocks = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("../rag-chat.actions", () => ({ askRagQuestionAction: mocks.ask }));
import { RagStudyAssistant } from "./rag-study-assistant";

describe("Study workspace RAG chat", () => {
  let root: Root;
  let container: HTMLDivElement;
  const previousScrollTo = HTMLDivElement.prototype.scrollTo;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    HTMLDivElement.prototype.scrollTo = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <RagStudyAssistant compact fillHeight focusSessionId="focus-session" documents={[
        { id: "document", file_name: "Study notes.pdf", visibility: "private" },
      ]} />
    </NextIntlClientProvider>));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    HTMLDivElement.prototype.scrollTo = previousScrollTo;
  });
  it("opens the document selector without submitting the question", () => {
    const select = [...container.querySelectorAll("button")].find(button => button.textContent?.includes(messages.rag.chooseDocuments))!;
    act(() => select.click());
    expect(document.body.textContent).toContain("Study notes.pdf");
    expect(mocks.ask).not.toHaveBeenCalled();
  });
  it("sends questions with focus context and renders the response inside the workspace", async () => {
    mocks.ask.mockResolvedValue({ success: true, data: {
      session_id: "chat-session", answer: "Here is your study answer.", sources: [],
      context_mode: "general", top_k: 5, prompt_variant: "grounded_rule", latency_ms: 10,
    } });
    const input = container.querySelector("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Explain this concept");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({
      question: "Explain this concept", focusSessionId: "focus-session", preferredLocale: "en",
    }));
    expect(container.textContent).toContain("Here is your study answer.");
    expect(container.querySelector("textarea")).toBe(input);
  });
});
