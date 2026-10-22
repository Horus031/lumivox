import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTranslator, NextIntlClientProvider, useLocale } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import en from "@/messages/en.json";

const mocks = vi.hoisted(() => ({ push: vi.fn(), metrics: vi.fn(), sessions: vi.fn(), answers: vi.fn(), session: vi.fn(), messages: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push }), Link: ({ href, children, ...props }: React.ComponentProps<"a">) => { const locale = useLocale(); return <a href={`/${locale}${href}`} {...props}>{children}</a>; } }));
vi.mock("@/features/admin/admin-ai.queries", () => ({ getAdminAiMonitoringMetrics: mocks.metrics, searchAdminRagChatSessions: mocks.sessions, getAdminRagEmptySourceAnswers: mocks.answers, getAdminRagChatSessionDetail: mocks.session, getAdminRagChatMessages: mocks.messages }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "vi", getTranslations: async (namespace: "admin.ai.page" | "admin.ai.detail" | "admin.common") => createTranslator({ locale: "vi", messages, namespace }) }));
vi.mock("@/components/ui/select", () => {
  const Context = createContext<{ value: string; onValueChange: (value: string) => void }>({ value: "", onValueChange: () => {} });
  return {
    Select: ({ children, ...props }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <Context.Provider value={props}>{children}</Context.Provider>,
    SelectTrigger: (props: React.ComponentProps<"select">) => { const state = useContext(Context); return <select {...props} value={state.value} onChange={(event) => state.onValueChange(event.target.value)}>{["all", "general", "document_rag"].map((value) => <option key={value}>{value}</option>)}</select>; },
    SelectContent: () => null, SelectGroup: () => null, SelectItem: () => null, SelectLabel: () => null, SelectValue: () => null,
  };
});

import { AdminAiSearchForm } from "./admin-ai-search-form";
import { AdminAiMetricsOverview } from "./admin-ai-metrics-overview";
import { AdminRagSessionsTable } from "./admin-rag-sessions-table";
import { AdminRagMessagesList } from "./admin-rag-messages-list";
import { AdminRagEmptySourceList } from "./admin-rag-empty-source-list";
import AiPage from "@/app/[locale]/(protected)/admin/ai/page";
import SessionPage from "@/app/[locale]/(protected)/admin/ai/sessions/[sessionId]/page";

const metrics = { total_rag_sessions: 12345, total_rag_messages: 123456, general_ai_messages: 11, document_rag_messages: 22, grounded_rule_messages: 33, no_rule_messages: 44, top_k_3_messages: 55, top_k_5_messages: 66, top_k_7_messages: 77, avg_latency_ms: 88, max_latency_ms: 99, assistant_messages: 100, user_messages: 101, messages_with_sources: 102, document_rag_messages_without_sources: 103, processed_documents: 104, failed_documents: 105, pending_documents: 106, unsupported_documents: 107, total_document_chunks: 108, embedded_document_chunks: 109 };
const session = { session_id: "session-1234", user_id: "user-1234", user_name: null, user_email: null, context_mode: "document_rag", selected_document_count: 2, selected_document_ids: ["doc-1", "doc-2"], top_k: null, prompt_variant: null, message_count: 4, assistant_message_count: 2, avg_latency_ms: null, created_at: "2026-10-12T00:00:00Z", updated_at: null };
const message = { message_id: "message-1", role: "assistant", content: "<script>unsafe</script>\nOriginal content", context_mode: "document_rag", selected_document_ids: ["doc-1"], top_k: 5, prompt_variant: "grounded_rule", sources: { document_id: "doc-1", content: "<img src=x onerror=unsafe>" }, source_count: 1, latency_ms: null, created_at: "2026-10-12T00:00:00Z" };
const answer = { ...session, message_id: "answer-1", content: "Original empty-source answer", prompt_variant: null, latency_ms: null };

describe("Admin AI/RAG UI", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.metrics.mockResolvedValue(metrics); mocks.sessions.mockResolvedValue([session]); mocks.answers.mockResolvedValue([answer]); mocks.session.mockResolvedValue(session); mocks.messages.mockResolvedValue([message]);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  async function render(children: ReactNode, locale = "vi") { await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? messages : en} timeZone="UTC" onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>)); }
  async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

  it("preserves encoded query/mode and omits blank/all filters", async () => {
    await render(<AdminAiSearchForm initialQuery="  A & B  " initialContextMode="document_rag" />); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/ai?q=A+%26+B&mode=document_rag");
    act(() => { const input = container.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, " "); input.dispatchEvent(new Event("input", { bubbles: true })); const select = container.querySelector("select")!; select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/ai");
    for (const control of container.querySelectorAll("input,select")) expect(container.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
  });
  it("retains twelve metric items and separates all three top-k counts", async () => {
    await render(<AdminAiMetricsOverview metrics={metrics} />); const cards = container.querySelectorAll("article"); expect(cards).toHaveLength(12);
    expect(cards[0].textContent).toContain("12345"); expect(cards[3].textContent).toContain("88 ms"); expect(cards[11].querySelectorAll("dd")).toHaveLength(3); expect([...cards[11].querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["55", "66", "77"]);
    expect(container.textContent).toContain("109"); expect(container.textContent).toContain("105");
  });
  it("keeps null metric fallbacks at zero", async () => {
    await render(<AdminAiMetricsOverview metrics={null} />); expect(container.querySelectorAll("article")).toHaveLength(12); expect(container.textContent).toContain("0 ms"); expect([...container.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["0", "0", "0"]);
  });
  it.each(["vi", "en"])("keeps session identity, metadata fallbacks and localized links in %s", async (locale) => {
    await render(<AdminRagSessionsTable sessions={[session]} />, locale); expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(7); expect(container.querySelector('[role="region"]')!.getAttribute("tabindex")).toBe("0"); expect(container.querySelector(`a[href="/${locale}/admin/ai/sessions/session-1234"]`)).not.toBeNull(); expect(container.textContent).toContain("user-123"); expect(container.textContent).toContain("session-1234"); expect(container.textContent).toContain(new Date(session.created_at).toLocaleString(locale)); expect(container.textContent).toContain(locale === "vi" ? messages.admin.common.na : en.admin.common.na);
  });
  it("renders all monitoring empty states without a table", async () => {
    await render(<><AdminRagSessionsTable sessions={[]} /><AdminRagEmptySourceList answers={[]} /><AdminRagMessagesList messages={[]} /></>); expect(container.querySelector("table")).toBeNull(); expect(container.textContent).toContain(messages.admin.ai.sessions.empty); expect(container.textContent).toContain(messages.admin.ai.emptySources.empty); expect(container.textContent).toContain(messages.admin.ai.messages.empty);
  });
  it("keeps content and raw source JSON escaped and keyboard-focusable", async () => {
    await render(<AdminRagMessagesList messages={[message]} />); expect(container.querySelector("script")).toBeNull(); expect(container.querySelector("img")).toBeNull(); expect(container.querySelector('p[role="region"]')!.textContent).toBe(message.content); const raw = container.querySelector("pre")!; expect(raw.textContent).toBe(JSON.stringify(message.sources, null, 2)); expect(raw.tabIndex).toBe(0); expect(document.getElementById(raw.getAttribute("aria-labelledby")!)!.tagName).toBe("SUMMARY"); expect(container.textContent).toContain("0 ms");
  });
  it.each([["assistant", null, false], ["assistant", [], true], ["assistant", {}, true], ["user", { source: "hidden" }, false]] as const)("preserves raw-source visibility for role=%s / sources=%s", async (role, sources, visible) => {
    await render(<AdminRagMessagesList messages={[{ ...message, role, sources }]} />); expect(container.querySelector("details") !== null).toBe(visible);
  });
  it("preserves empty-source answer identity, null fallbacks and review destination", async () => {
    await render(<AdminRagEmptySourceList answers={[{ ...answer, content: "<img src=x>" }]} />); expect(container.querySelector("img")).toBeNull(); expect(container.textContent).toContain("<img src=x>"); expect(container.querySelector('a[href="/vi/admin/ai/sessions/session-1234"]')).not.toBeNull(); expect(container.textContent).toContain(messages.admin.common.na);
  });
  it("retains page query arguments and all three reads", async () => {
    await render(await AiPage({ searchParams: Promise.resolve({ q: "owner", mode: "general" }) })); expect(mocks.sessions).toHaveBeenCalledWith({ query: "owner", contextMode: "general" }); expect(mocks.metrics).toHaveBeenCalledTimes(1); expect(mocks.answers).toHaveBeenCalledTimes(1); expect(container.querySelector("main")).toBeNull(); expect(container.querySelectorAll("article")).toHaveLength(13);
  });
  it("keeps detail reads, seven metadata values and selected document IDs", async () => {
    await render(await SessionPage({ params: Promise.resolve({ sessionId: "session-1234" }) })); expect(mocks.session).toHaveBeenCalledWith("session-1234"); expect(mocks.messages).toHaveBeenCalledWith("session-1234"); expect(container.querySelectorAll("dl")[0].querySelectorAll("dt")).toHaveLength(7); expect(container.textContent).toContain("doc-1"); expect(container.textContent).toContain("doc-2"); expect(container.querySelector('a[href="/vi/admin/ai"]')).not.toBeNull();
  });
  it("omits selected-document section for null/empty identities and keeps not-found", async () => {
    mocks.session.mockResolvedValue({ ...session, selected_document_ids: [] }); mocks.messages.mockResolvedValue([]); await render(await SessionPage({ params: Promise.resolve({ sessionId: "session-1234" }) })); expect(container.querySelector("ul")).toBeNull(); expect(container.textContent).toContain(messages.admin.ai.messages.empty); mocks.session.mockResolvedValue(null); await expect(SessionPage({ params: Promise.resolve({ sessionId: "missing" }) })).rejects.toThrow("NOT_FOUND");
  });
});
