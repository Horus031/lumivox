import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTranslator, NextIntlClientProvider, useLocale } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import en from "@/messages/en.json";

const confirmation = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/components/ui/use-confirm-dialog", () => ({ useConfirmDialog: () => confirmation }));

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), role: vi.fn(), visibility: vi.fn(), remove: vi.fn(), process: vi.fn(), success: vi.fn(), error: vi.fn(), users: vi.fn(), user: vi.fn(), documents: vi.fn(), document: vi.fn(), chunks: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => { const locale = useLocale(); return <a href={`/${locale}${href}`} {...props}>{children}</a>; },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/admin/admin-users.actions", () => ({ updateAdminUserRoleAction: mocks.role, updateAdminUserLeaderboardVisibilityAction: mocks.visibility }));
vi.mock("@/features/admin/admin-documents.actions", () => ({ adminDeleteLearningDocumentAction: mocks.remove, adminReprocessLearningDocumentAction: mocks.process }));
vi.mock("@/features/admin/admin-users.queries", () => ({ searchAdminUsers: mocks.users, getAdminUserDetail: mocks.user }));
vi.mock("@/features/admin/admin-documents.queries", () => ({ searchAdminLearningDocuments: mocks.documents, getAdminLearningDocumentDetail: mocks.document, getAdminDocumentChunks: mocks.chunks }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "vi", getTranslations: async (namespace: "admin.users.page" | "admin.users.detail" | "admin.documents.page" | "admin.documents.detail" | "admin.common") => createTranslator({ locale: "vi", messages, namespace }) }));
vi.mock("@/components/ui/select", () => {
  const Context = createContext<{ value: string; disabled: boolean; onValueChange: (value: string) => void }>({ value: "", disabled: false, onValueChange: () => {} });
  return {
    Select: ({ children, ...props }: { children: ReactNode; value: string; disabled?: boolean; onValueChange: (value: string) => void }) => <Context.Provider value={{ disabled: false, ...props }}>{children}</Context.Provider>,
    SelectTrigger: (props: React.ComponentProps<"select">) => { const state = useContext(Context); return <select {...props} value={state.value} disabled={state.disabled} onChange={(e) => state.onValueChange(e.target.value)}>{["all", "pending", "processing", "completed", "failed", "unsupported", "user", "admin"].map((value) => <option key={value}>{value}</option>)}</select>; },
    SelectContent: () => null, SelectGroup: () => null, SelectItem: () => null, SelectLabel: () => null, SelectValue: () => null,
  };
});

import { AdminUserSearchForm } from "./admin-user-search-form";
import { AdminDocumentSearchForm } from "./admin-document-search-form";
import { AdminUserRoleSelect } from "./admin-user-role-select";
import { AdminUserLeaderboardToggle } from "./admin-user-leaderboard-toggle";
import { AdminDocumentReprocessButton } from "./admin-document-reprocess-button";
import { AdminDocumentDeleteButton } from "./admin-document-delete-button";
import { AdminUsersTable } from "./admin-users-table";
import { AdminDocumentsTable } from "./admin-documents-table";
import { AdminDocumentChunksTable } from "./admin-document-chunks-table";
import UsersPage from "@/app/[locale]/(protected)/admin/users/page";
import UserPage from "@/app/[locale]/(protected)/admin/users/[userId]/page";
import DocumentsPage from "@/app/[locale]/(protected)/admin/documents/page";
import DocumentPage from "@/app/[locale]/(protected)/admin/documents/[documentId]/page";

const user = { user_id: "user-1", email: "long@email.test", full_name: "Full name", display_name: "Display name", role: "admin", leaderboard_opt_in: true, created_at: null, last_sign_in_at: null, total_goals: 2, total_tasks: 10, completed_tasks: 7, total_focus_sessions: 5, total_focus_minutes: 50, uploaded_documents: 3, processed_documents: 2, rag_chat_sessions: 4, rag_chat_messages: 8, study_group_memberships: 1, current_streak: 6, token_balance: 20 };
const documentData = { document_id: "doc-1", owner_id: "user-1", owner_name: "Owner", owner_email: null, file_name: "VeryLongDocument.pdf", file_path: "user-1/doc.pdf", mime_type: "application/pdf", file_size_bytes: null, visibility: "private", extracted_text_status: "completed", chunk_count: 2, embedded_chunk_count: 1, failed_chunk_count: 1, created_at: "2026-10-12T00:00:00Z", updated_at: "2026-10-13T00:00:00Z", extracted_text_preview: "<script>unsafe</script>" };
const chunk = { chunk_id: "chunk-1", chunk_index: 0, content: "<img src=x onerror=unsafe>", content_char_count: 28, token_estimate: null, embedding_model: null, status: "pending", has_embedding: false, created_at: "2026-10-12T00:00:00Z" };

describe("Admin management UI", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); confirmation.mockResolvedValue(true); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    for (const action of [mocks.role, mocks.visibility, mocks.remove, mocks.process]) action.mockResolvedValue({ success: true, message: "OK" });
    mocks.users.mockResolvedValue([user]); mocks.user.mockResolvedValue(user); mocks.documents.mockResolvedValue([documentData]); mocks.document.mockResolvedValue(documentData); mocks.chunks.mockResolvedValue([chunk]);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  async function render(children: ReactNode, locale = "vi") { await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? messages : en} timeZone="UTC" onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>)); }
  function enter(value: string) { const input = container.querySelector("input")!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
  async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
  async function select(value: string) { await act(async () => { const control = container.querySelector("select")!; control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); }); }
  async function click(button = container.querySelector<HTMLButtonElement>("button")!) { await act(async () => button.click()); }

  it("keeps trimmed/encoded user query and clears empty search", async () => {
    await render(<AdminUserSearchForm initialQuery="old" />); enter("  Nguyễn & A  "); await submit();
    expect(mocks.push).toHaveBeenLastCalledWith(`/admin/users?q=${encodeURIComponent("Nguyễn & A").replaceAll("%20", "+")}`);
    expect(container.querySelector("label")!.htmlFor).toBe(container.querySelector("input")!.id);
    enter(" "); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/users");
  });
  it("retains combined document query/status and all-status omission", async () => {
    await render(<AdminDocumentSearchForm initialQuery="paper" initialStatus="failed" />); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/documents?q=paper&status=failed");
    expect(container.querySelectorAll("label")).toHaveLength(2); await select("all"); enter(""); await submit(); expect(mocks.push).toHaveBeenLastCalledWith("/admin/documents");
  });
  it.each([true, false])("retains role payload and refresh on success=%s", async (success) => {
    mocks.role.mockResolvedValue({ success, message: "Result" }); await render(<AdminUserRoleSelect userId="user-1" currentRole="user" />); await select("admin");
    expect(mocks.role).toHaveBeenCalledWith({ userId: "user-1", role: "admin" }); expect(mocks.refresh).toHaveBeenCalledTimes(1); expect(success ? mocks.success : mocks.error).toHaveBeenCalledWith("Result");
    expect(container.querySelector("select")!.value).toBe("user"); expect(container.querySelector("select")!.disabled).toBe(false);
  });
  it.each([true, false])("retains checkbox payload and refresh on success=%s", async (success) => {
    mocks.visibility.mockResolvedValue({ success, message: "Result" }); await render(<AdminUserLeaderboardToggle userId="user-1" currentValue={true} />); await click(container.querySelector<HTMLButtonElement>('[role="checkbox"]')!);
    expect(mocks.visibility).toHaveBeenCalledWith({ userId: "user-1", leaderboardOptIn: false }); expect(mocks.refresh).toHaveBeenCalledTimes(1); expect(success ? mocks.success : mocks.error).toHaveBeenCalledWith("Result");
    expect(container.querySelector('[role="checkbox"]')!.getAttribute("aria-checked")).toBe("true");
  });
  it("disables the role control while a save is pending", async () => {
    let resolve!: (result: { success: boolean; message: string }) => void; mocks.role.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render(<AdminUserRoleSelect userId="user-1" currentRole="user" />); await select("admin"); expect(container.querySelector("select")!.disabled).toBe(true);
    await act(async () => resolve({ success: false, message: "Rejected" })); expect(container.querySelector("select")!.disabled).toBe(false);
  });
  it("blocks processing documents and preserves process/reprocess labels", async () => {
    await render(<AdminDocumentReprocessButton documentId="doc-1" ownerId="user-1" status="processing" compact />); await click(); expect(mocks.process).not.toHaveBeenCalled(); expect(container.querySelector("button")!.disabled).toBe(true);
    await render(<AdminDocumentReprocessButton documentId="doc-1" ownerId="user-1" status="completed" compact />); expect(container.querySelector("button")!.title).toBe(messages.admin.documents.actions.reprocess); await click(); expect(mocks.process).toHaveBeenCalledWith({ documentId: "doc-1", ownerId: "user-1" }); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("reports processing failure and restores the button", async () => {
    mocks.process.mockResolvedValue({ success: false, message: "Rejected" }); await render(<AdminDocumentReprocessButton documentId="doc-1" ownerId="user-1" status={null} />); await click();
    expect(mocks.error).toHaveBeenCalledWith("Rejected"); expect(mocks.refresh).toHaveBeenCalledTimes(1); expect(container.querySelector("button")!.disabled).toBe(false);
  });
  it("never deletes without confirmation", async () => {
    confirmation.mockResolvedValue(false); await render(<AdminDocumentDeleteButton documentId="doc-1" filePath="user-1/doc.pdf" />); await click(); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  });
  it.each([true, false])("keeps scoped delete payload and navigation on success=%s", async (success) => {
    confirmation.mockResolvedValue(true); mocks.remove.mockResolvedValue({ success, message: "Result" }); await render(<AdminDocumentDeleteButton documentId="doc-1" filePath="user-1/doc.pdf" />); await click();
    expect(mocks.remove).toHaveBeenCalledWith({ documentId: "doc-1", filePath: "user-1/doc.pdf" }); expect(mocks.push).toHaveBeenCalledTimes(success ? 1 : 0); expect(mocks.refresh).toHaveBeenCalledTimes(success ? 1 : 0); if (success) expect(mocks.push).toHaveBeenCalledWith("/admin/documents");
  });
  it.each(["vi", "en"])("shows semantic tables and localized detail links in %s", async (locale) => {
    await render(<><AdminUsersTable users={[user]} /><AdminDocumentsTable documents={[documentData]} /></>, locale);
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(14); expect(container.querySelectorAll('[role="region"][tabindex="0"]')).toHaveLength(2);
    expect(container.querySelector(`a[href="/${locale}/admin/users/user-1"]`)).not.toBeNull(); expect(container.querySelector(`a[href="/${locale}/admin/documents/doc-1"]`)).not.toBeNull();
    expect(container.textContent).toContain("1/2"); expect(container.textContent).toContain(locale === "vi" ? messages.admin.common.na : en.admin.common.na);
    expect(container.querySelector("p[title]")!.getAttribute("title")).toBe(documentData.mime_type);
  });
  it("renders empty tables and chunks without nested cards or scroll regions", async () => {
    await render(<><AdminUsersTable users={[]} /><AdminDocumentsTable documents={[]} /><AdminDocumentChunksTable chunks={[]} /></>); expect(container.querySelector("table")).toBeNull(); expect(container.querySelector('[role="region"]')).toBeNull(); expect(container.textContent).toContain(messages.admin.documents.chunks.empty);
  });
  it("retains native chunk disclosure, metadata fallbacks and escaped content", async () => {
    await render(<AdminDocumentChunksTable chunks={[chunk]} />); expect(container.querySelector("details")).not.toBeNull(); expect(container.querySelector("img")).toBeNull(); expect(container.textContent).toContain(chunk.content); expect(container.textContent).toContain(messages.admin.common.na);
  });
  it("preserves search page query arguments", async () => {
    await render(await UsersPage({ searchParams: Promise.resolve({ q: "name" }) })); expect(mocks.users).toHaveBeenCalledWith("name");
    await render(await DocumentsPage({ searchParams: Promise.resolve({ q: "file", status: "failed" }) })); expect(mocks.documents).toHaveBeenCalledWith({ query: "file", status: "failed" }); expect(container.querySelector("main")).toBeNull();
  });
  it("retains detail queries, user metrics and all document metadata", async () => {
    await render(await UserPage({ params: Promise.resolve({ userId: "user-1" }) })); expect(mocks.user).toHaveBeenCalledWith("user-1"); expect(container.querySelectorAll("article")).toHaveLength(8); expect(container.querySelector('a[href="/vi/admin/users"]')).not.toBeNull();
    await render(await DocumentPage({ params: Promise.resolve({ documentId: "doc-1" }) })); expect(mocks.document).toHaveBeenCalledWith("doc-1"); expect(mocks.chunks).toHaveBeenCalledWith("doc-1"); expect(container.querySelectorAll("dt")).toHaveLength(8); expect(container.querySelector('a[href="/vi/admin/documents"]')).not.toBeNull(); expect(container.querySelector("script")).toBeNull(); expect(container.textContent).toContain(documentData.extracted_text_preview);
  });
  it("keeps not-found behavior for inaccessible/missing details", async () => {
    mocks.user.mockResolvedValue(null); mocks.document.mockResolvedValue(null); await expect(UserPage({ params: Promise.resolve({ userId: "missing" }) })).rejects.toThrow("NOT_FOUND"); await expect(DocumentPage({ params: Promise.resolve({ documentId: "missing" }) })).rejects.toThrow("NOT_FOUND");
  });
});
