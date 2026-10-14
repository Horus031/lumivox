import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import en from "@/messages/en.json";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), archive: vi.fn(), remove: vi.fn(), clear: vi.fn(), success: vi.fn(), error: vi.fn(), roadmapMetrics: vi.fn(), roadmaps: vi.fn(), translationMetrics: vi.fn(), translations: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/admin/admin-roadmaps.actions", () => ({ adminSetLearningRoadmapArchivedAction: mocks.archive }));
vi.mock("@/features/admin/admin-translations.actions", () => ({ adminDeleteAiContentTranslationAction: mocks.remove, adminClearAiEntityTranslationsAction: mocks.clear }));
vi.mock("@/features/admin/admin-roadmaps.queries", () => ({ getAdminRoadmapMetrics: mocks.roadmapMetrics, searchAdminLearningRoadmaps: mocks.roadmaps }));
vi.mock("@/features/admin/admin-translations.queries", () => ({ getAdminAiTranslationMetrics: mocks.translationMetrics, searchAdminAiContentTranslations: mocks.translations }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: "admin.roadmaps.page" | "admin.translations.page") => createTranslator({ locale: "vi", messages, namespace }) }));
vi.mock("@/components/ui/select", () => {
  const Context = createContext<{ value: string; onValueChange: (value: string) => void }>({ value: "", onValueChange: () => {} });
  return {
    Select: ({ children, ...props }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <Context.Provider value={props}>{children}</Context.Provider>,
    SelectTrigger: (props: React.ComponentProps<"select">) => { const state = useContext(Context); return <select {...props} value={state.value} onChange={(event) => state.onValueChange(event.target.value)}>{["all", "draft", "applied", "archived", "en", "vi", "completed", "failed"].map((value) => <option key={value}>{value}</option>)}</select>; },
    SelectContent: () => null, SelectItem: () => null, SelectValue: () => null,
  };
});

import { AdminRoadmapSearchForm } from "./admin-roadmap-search-form";
import { AdminTranslationSearchForm } from "./admin-translation-search-form";
import { AdminRoadmapArchiveButton } from "./admin-roadmap-archive-button";
import { AdminTranslationDeleteButton, AdminClearEntityTranslationsButton } from "./admin-translation-delete-button";
import { AdminRoadmapsTable } from "./admin-roadmaps-table";
import { AdminTranslationsTable } from "./admin-translations-table";
import { AdminRoadmapMetricsOverview } from "./admin-roadmap-metrics-overview";
import { AdminTranslationMetricsOverview } from "./admin-translation-metrics-overview";
import RoadmapsPage from "@/app/[locale]/(protected)/admin/roadmaps/page";
import TranslationsPage from "@/app/[locale]/(protected)/admin/ai/translations/page";

const roadmap = { roadmap_id: "roadmap-1", user_id: "owner-1", owner_name: null, owner_email: null, title: "Roadmap title", topic: "Topic", subject_name: null, description: null, current_level: "beginner", target_level: "advanced", start_date: "2026-10-01", end_date: "2026-12-01", study_days_per_week: 5, minutes_per_study_day: 60, preferred_locale: "vi", status: "draft", goal_nodes: 2, task_nodes: 3, subtask_nodes: 4, total_nodes: 9, ai_provider: null, ai_model: null, ai_latency_ms: 0, applied_at: null, archived_at: null, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z" };
const translation = { translation_id: "translation-1", owner_id: "owner-1", owner_name: null, owner_email: null, entity_type: "roadmap", entity_id: "roadmap-1", field_name: "title", source_locale: "en", target_locale: "vi", source_hash: "hash", translated_text: "<img src=x onerror=unsafe>\nOriginal text", provider: null, model_name: null, status: "failed", error_message: "<script>error</script>", created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z" };
const roadmapMetrics = { total_roadmaps: 101, draft_roadmaps: 102, applied_roadmaps: 103, archived_roadmaps: 104, total_roadmap_nodes: 105, total_goal_nodes: 106, total_task_nodes: 107, total_subtask_nodes: 108 };
const translationMetrics = { total_translations: 111, english_translations: 112, vietnamese_translations: 113, failed_translations: 114, unique_entities: 115 };

describe("Admin Roadmap/Translation monitoring", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    for (const action of [mocks.archive, mocks.remove, mocks.clear]) action.mockResolvedValue({ success: true, message: "OK" });
    mocks.roadmapMetrics.mockResolvedValue(roadmapMetrics); mocks.roadmaps.mockResolvedValue([roadmap]); mocks.translationMetrics.mockResolvedValue(translationMetrics); mocks.translations.mockResolvedValue([translation]);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  async function render(children: ReactNode, locale = "vi") { await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? messages : en} timeZone="UTC" onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>)); }
  async function click(button = container.querySelector<HTMLButtonElement>("button")!) { await act(async () => button.click()); }
  async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
  function enter(value: string) { act(() => { const input = container.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
  async function select(value: string, index = 0) { await act(async () => { const input = container.querySelectorAll("select")[index]; input.value = value; input.dispatchEvent(new Event("change", { bubbles: true })); }); }

  it("preserves trimmed/encoded roadmap filters and all-status omission", async () => {
    await render(<AdminRoadmapSearchForm initialQuery="  A & B  " initialStatus="archived" />); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/roadmaps?q=A+%26+B&status=archived"); enter(" "); await select("all"); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/roadmaps");
    for (const control of container.querySelectorAll("input,select")) expect(container.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
  });
  it("preserves translation query/target locale/status independently of interface locale", async () => {
    await render(<AdminTranslationSearchForm initialQuery="  A & B  " initialTargetLocale="en" initialStatus="failed" />); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/ai/translations?q=A+%26+B&locale=en&status=failed"); enter(""); await select("all", 0); await select("all", 1); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/ai/translations");
    expect(container.querySelectorAll("label")).toHaveLength(3);
  });
  it("never offers archive/restore for applied roadmaps", async () => {
    await render(<AdminRoadmapArchiveButton roadmapId="roadmap-1" status="applied" />); expect(container.querySelector("button")).toBeNull(); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it.each(["draft", "archived"])("requires confirmation for %s roadmaps", async (status) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); await render(<AdminRoadmapArchiveButton roadmapId="roadmap-1" status={status} />); await click(); expect(mocks.archive).not.toHaveBeenCalled(); expect(confirm).toHaveBeenCalledWith(status === "archived" ? messages.admin.roadmaps.actions.restoreConfirm : messages.admin.roadmaps.actions.archiveConfirm);
  });
  it.each([["draft", true], ["archived", true], ["draft", false]] as const)("keeps archive payload for %s and success=%s", async (status, success) => {
    vi.spyOn(window, "confirm").mockReturnValue(true); mocks.archive.mockResolvedValue({ success, message: "Result" }); await render(<AdminRoadmapArchiveButton roadmapId="roadmap-1" status={status} />); await click(); expect(mocks.archive).toHaveBeenCalledWith({ roadmapId: "roadmap-1", archived: status !== "archived" }); expect(mocks.refresh).toHaveBeenCalledTimes(success ? 1 : 0); expect(success ? mocks.success : mocks.error).toHaveBeenCalledWith("Result"); expect(container.querySelector("button")!.disabled).toBe(false);
  });
  it.each(["delete", "clear"])("requires confirmation for translation %s", async (mode) => {
    vi.spyOn(window, "confirm").mockReturnValue(false); await render(mode === "delete" ? <AdminTranslationDeleteButton translationId="translation-1" /> : <AdminClearEntityTranslationsButton entityType="roadmap" entityId="roadmap-1" />); await click(); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled();
  });
  it.each([["delete", true], ["delete", false], ["clear", true], ["clear", false]] as const)("keeps scoped %s payload and success-only refresh=%s", async (mode, success) => {
    vi.spyOn(window, "confirm").mockReturnValue(true); const action = mode === "delete" ? mocks.remove : mocks.clear; action.mockResolvedValue({ success, message: "Result" }); await render(mode === "delete" ? <AdminTranslationDeleteButton translationId="translation-1" /> : <AdminClearEntityTranslationsButton entityType="roadmap" entityId="roadmap-1" />); await click(); expect(action).toHaveBeenCalledWith(mode === "delete" ? { translationId: "translation-1" } : { entityType: "roadmap", entityId: "roadmap-1" }); expect(mocks.refresh).toHaveBeenCalledTimes(success ? 1 : 0); expect(success ? mocks.success : mocks.error).toHaveBeenCalledWith("Result");
  });
  it.each(["archive", "delete", "clear"])("disables the %s control until pending request resolves", async (mode) => {
    vi.spyOn(window, "confirm").mockReturnValue(true); let resolve!: (result: { success: boolean; message: string }) => void; const action = mode === "archive" ? mocks.archive : mode === "delete" ? mocks.remove : mocks.clear; action.mockReturnValue(new Promise((done) => { resolve = done; })); await render(mode === "archive" ? <AdminRoadmapArchiveButton roadmapId="roadmap-1" status="draft" /> : mode === "delete" ? <AdminTranslationDeleteButton translationId="translation-1" /> : <AdminClearEntityTranslationsButton entityType="roadmap" entityId="roadmap-1" />); await click(); expect(container.querySelector("button")!.disabled).toBe(true); await click(); expect(action).toHaveBeenCalledTimes(1); await act(async () => resolve({ success: false, message: "Rejected" })); expect(container.querySelector("button")!.disabled).toBe(false);
  });
  it.each(["vi", "en"])("keeps roadmap metadata, guards, translation/error escaping and disclosure labels in %s", async (locale) => {
    await render(<><AdminRoadmapsTable roadmaps={[roadmap, { ...roadmap, roadmap_id: "applied-1", status: "applied" }]} /><AdminTranslationsTable translations={[translation]} /></>, locale); expect(container.querySelectorAll("article")).toHaveLength(3); expect(container.querySelectorAll("article")[1].querySelector("button")).toBeNull(); expect(container.textContent).toContain("owner-1"); expect(container.textContent).toContain("2026-10-01"); expect(container.textContent).toContain("Original text"); expect(container.querySelector("img")).toBeNull(); expect(container.querySelector("script")).toBeNull(); const region = container.querySelector<HTMLElement>('[role="region"]')!; expect(region.tabIndex).toBe(0); expect(document.getElementById(region.getAttribute("aria-labelledby")!)!.tagName).toBe("SUMMARY"); expect(container.textContent).toContain(locale === "vi" ? messages.admin.common.na : en.admin.common.na);
  });
  it("keeps metric values and null-to-zero fallback for both screens", async () => {
    await render(<><AdminRoadmapMetricsOverview metrics={roadmapMetrics} /><AdminTranslationMetricsOverview metrics={translationMetrics} /></>); expect(container.querySelectorAll("article")).toHaveLength(9); expect(container.textContent).toContain("108"); expect(container.textContent).toContain("115"); await render(<><AdminRoadmapMetricsOverview metrics={null} /><AdminTranslationMetricsOverview metrics={null} /></>); expect(container.querySelectorAll("article")).toHaveLength(9); expect(container.textContent).not.toContain("undefined"); expect(container.textContent).toContain("0");
  });
  it("shows unframed empty list states", async () => {
    await render(<><AdminRoadmapsTable roadmaps={[]} /><AdminTranslationsTable translations={[]} /></>); expect(container.querySelector("article")).toBeNull(); expect(container.textContent).toContain(messages.admin.roadmaps.table.empty); expect(container.textContent).toContain(messages.admin.translations.table.empty);
  });
  it("preserves both page query contracts and metric reads", async () => {
    await render(await RoadmapsPage({ searchParams: Promise.resolve({ q: "topic", status: "draft" }) })); expect(mocks.roadmaps).toHaveBeenCalledWith({ query: "topic", status: "draft" }); expect(mocks.roadmapMetrics).toHaveBeenCalledTimes(1); await render(await TranslationsPage({ searchParams: Promise.resolve({ q: "text", locale: "en", status: "failed" }) })); expect(mocks.translations).toHaveBeenCalledWith({ query: "text", targetLocale: "en", status: "failed" }); expect(mocks.translationMetrics).toHaveBeenCalledTimes(1); expect(container.querySelector("main")).toBeNull();
  });
});
