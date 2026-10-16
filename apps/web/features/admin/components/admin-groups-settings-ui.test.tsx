import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTranslator, NextIntlClientProvider, useLocale } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import en from "@/messages/en.json";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), archive: vi.fn(), remove: vi.fn(), setting: vi.fn(), success: vi.fn(), error: vi.fn(), groups: vi.fn(), group: vi.fn(), members: vi.fn(), messages: vi.fn(), settings: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }), Link: ({ href, children, ...props }: React.ComponentProps<"a">) => { const locale = useLocale(); return <a href={`/${locale}${href}`} {...props}>{children}</a>; } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/features/admin/admin-groups.actions", () => ({ adminSetStudyGroupArchivedAction: mocks.archive, adminDeleteStudyGroupMessageAction: mocks.remove }));
vi.mock("@/features/admin/admin-settings.actions", () => ({ updateAdminCmsSettingAction: mocks.setting }));
vi.mock("@/features/admin/admin-groups.queries", () => ({ searchAdminStudyGroups: mocks.groups, getAdminStudyGroupDetail: mocks.group, getAdminStudyGroupMembers: mocks.members, getAdminStudyGroupMessages: mocks.messages }));
vi.mock("@/features/admin/admin-settings.queries", () => ({ getAdminCmsSettings: mocks.settings }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "vi", getTranslations: async (namespace: "admin.groups.page" | "admin.groups.detail" | "admin.common" | "admin.settings.page") => createTranslator({ locale: "vi", messages, namespace }) }));
vi.mock("@/components/ui/select", () => {
  const Context = createContext<{ value: string; disabled: boolean; onValueChange: (value: string) => void }>({ value: "", disabled: false, onValueChange: () => {} });
  return {
    Select: ({ children, ...props }: { children: ReactNode; value: string; disabled?: boolean; onValueChange: (value: string) => void }) => <Context.Provider value={{ disabled: false, ...props }}>{children}</Context.Provider>,
    SelectTrigger: (props: React.ComponentProps<"select">) => { const state = useContext(Context); return <select {...props} value={state.value} disabled={state.disabled} onChange={(event) => state.onValueChange(event.target.value)}>{["all", "active", "archived", "3", "5", "7", "grounded_rule", "no_rule"].map((value) => <option key={value}>{value}</option>)}</select>; },
    SelectContent: () => null, SelectGroup: () => null, SelectItem: () => null, SelectLabel: () => null, SelectValue: () => null,
  };
});

import { AdminGroupSearchForm } from "./admin-group-search-form";
import { AdminGroupArchiveButton } from "./admin-group-archive-button";
import { AdminGroupMessageDeleteButton } from "./admin-group-message-delete-button";
import { AdminGroupsTable } from "./admin-groups-table";
import { AdminGroupMembersTable } from "./admin-group-members-table";
import { AdminGroupMessagesTable } from "./admin-group-messages-table";
import { AdminCmsSettingsForm } from "./admin-cms-settings-form";
import GroupsPage from "@/app/[locale]/(protected)/admin/groups/page";
import GroupPage from "@/app/[locale]/(protected)/admin/groups/[groupId]/page";
import SettingsPage from "@/app/[locale]/(protected)/admin/settings/page";

const group = { group_id: "group-1", name: "Group name", description: null, owner_id: "owner-1", owner_name: null, owner_email: null, is_private: true, archived_at: null, admin_note: "<script>note</script>", member_count: 2, message_count: 1, created_at: "2026-10-12T00:00:00Z", updated_at: "2026-10-13T00:00:00Z" };
const member = { member_id: "member-1", user_id: "user-1", full_name: "Full name", display_name: "Display name", email: null, role: "member", membership_status: "active", joined_at: null };
const message = { message_id: "message-1", group_id: "group-1", user_id: "user-1", full_name: "Full name", display_name: null, email: null, content: "<img src=x onerror=unsafe>", created_at: "2026-10-13T00:00:00Z" };
const settings = [{ key: "weekly_challenge_default_focus_minutes", value: 600, description: null, updated_at: "2026-10-13T00:00:00Z" }];

describe("Admin Groups and CMS settings", () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    for (const action of [mocks.archive, mocks.remove, mocks.setting]) action.mockResolvedValue({ success: true, message: "OK" });
    mocks.groups.mockResolvedValue([group]); mocks.group.mockResolvedValue(group); mocks.members.mockResolvedValue([member]); mocks.messages.mockResolvedValue([message]); mocks.settings.mockResolvedValue(settings);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  async function render(children: ReactNode, locale = "vi") { await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? messages : en} timeZone="UTC" onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>)); }
  function enter(input: HTMLInputElement, value: string) { act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
  async function select(value: string, index = 0) { await act(async () => { const control = container.querySelectorAll("select")[index]; control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); }); }
  async function click(button = container.querySelector<HTMLButtonElement>("button")!) { await act(async () => button.click()); }
  async function blur(input: HTMLInputElement) { await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))); }

  it("keeps trimmed encoded filters and omits all/blank values", async () => {
    await render(<AdminGroupSearchForm initialQuery="  A & B  " initialStatus="archived" />);
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); expect(mocks.push).toHaveBeenLastCalledWith("/admin/groups?q=A+%26+B&status=archived");
    expect(container.querySelectorAll("label")).toHaveLength(2); enter(container.querySelector("input")!, " "); await select("all");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); expect(mocks.push).toHaveBeenLastCalledWith("/admin/groups");
  });
  it.each([false, true])("requires confirmation for archived=%s", async (archived) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); await render(<AdminGroupArchiveButton groupId="group-1" archived={archived} />); await click();
    expect(confirm).toHaveBeenCalledWith(archived ? messages.admin.groups.actions.restoreConfirm : messages.admin.groups.actions.archiveConfirm); expect(mocks.archive).not.toHaveBeenCalled();
  });
  it.each([true, false])("preserves archive note/payload and success-only refresh=%s", async (success) => {
    vi.spyOn(window, "confirm").mockReturnValue(true); mocks.archive.mockResolvedValue({ success, message: "Result" }); await render(<AdminGroupArchiveButton groupId="group-1" archived={false} />);
    const note = container.querySelector("input")!; expect(note.maxLength).toBe(500); expect(container.querySelector("label")!.htmlFor).toBe(note.id); enter(note, "Keep this note"); await click();
    expect(mocks.archive).toHaveBeenCalledWith({ groupId: "group-1", archived: true, adminNote: "Keep this note" }); expect(mocks.refresh).toHaveBeenCalledTimes(success ? 1 : 0); expect(note.value).toBe("Keep this note"); expect(success ? mocks.success : mocks.error).toHaveBeenCalledWith("Result");
  });
  it("restores archived groups with the original empty-note payload", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true); await render(<AdminGroupArchiveButton groupId="group-1" archived />); expect(container.querySelector("input")).toBeNull(); await click(); expect(mocks.archive).toHaveBeenCalledWith({ groupId: "group-1", archived: false, adminNote: "" });
  });
  it("disables archive note and submit during the request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true); let resolve!: (value: { success: boolean; message: string }) => void; mocks.archive.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render(<AdminGroupArchiveButton groupId="group-1" archived={false} />); await click(); expect(container.querySelector("input")!.disabled).toBe(true); expect(container.querySelector("button")!.disabled).toBe(true); await act(async () => resolve({ success: false, message: "Rejected" })); expect(container.querySelector("input")!.disabled).toBe(false);
  });
  it.each([true, false])("keeps message identity and success-only refresh=%s", async (success) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); await render(<AdminGroupMessageDeleteButton groupId="group-1" messageId="message-1" />); await click(); expect(mocks.remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); mocks.remove.mockResolvedValue({ success, message: "Result" }); await click(); expect(mocks.remove).toHaveBeenCalledWith({ groupId: "group-1", messageId: "message-1" }); expect(mocks.refresh).toHaveBeenCalledTimes(success ? 1 : 0); expect(container.querySelector("button")!.getAttribute("aria-label")).toBe(messages.admin.groups.actions.delete);
  });
  it.each(["vi", "en"])("shows bounded semantic tables, member fallbacks and escaped messages in %s", async (locale) => {
    await render(<><AdminGroupsTable groups={[group]} /><AdminGroupMembersTable members={[member]} /><AdminGroupMessagesTable groupId="group-1" messages={[message]} /></>, locale);
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(6); expect(container.querySelector('[role="region"]')!.getAttribute("tabindex")).toBe("0"); expect(container.querySelector(`a[href="/${locale}/admin/groups/group-1"]`)).not.toBeNull(); expect(container.textContent).toContain("Display name"); expect(container.textContent).toContain("Full name"); expect(container.textContent).toContain(message.content); expect(container.querySelector("img")).toBeNull();
  });
  it("shows empty states for all three group collections", async () => {
    await render(<><AdminGroupsTable groups={[]} /><AdminGroupMembersTable members={[]} /><AdminGroupMessagesTable groupId="group-1" messages={[]} /></>); expect(container.querySelector("table")).toBeNull(); expect(container.textContent).toContain(messages.admin.groups.members.empty); expect(container.textContent).toContain(messages.admin.groups.messages.empty);
  });
  it("preserves page queries, detail metadata and not-found behavior", async () => {
    await render(await GroupsPage({ searchParams: Promise.resolve({ q: "group", status: "active" }) })); expect(mocks.groups).toHaveBeenCalledWith({ query: "group", status: "active" });
    await render(await GroupPage({ params: Promise.resolve({ groupId: "group-1" }) })); expect(mocks.group).toHaveBeenCalledWith("group-1"); expect(mocks.members).toHaveBeenCalledWith("group-1"); expect(mocks.messages).toHaveBeenCalledWith("group-1"); expect(container.querySelectorAll("dt")).toHaveLength(6); expect(container.querySelector('a[href="/vi/admin/groups"]')).not.toBeNull(); expect(container.querySelector("script")).toBeNull(); mocks.group.mockResolvedValue(null); await expect(GroupPage({ params: Promise.resolve({ groupId: "missing" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("keeps default CMS values and associated labels", async () => {
    await render(<AdminCmsSettingsForm settings={[]} />); const checkboxes = container.querySelectorAll('[role="checkbox"]'); expect([...checkboxes].map((checkbox) => checkbox.getAttribute("aria-checked"))).toEqual(["true", "true", "false"]);
    expect([...container.querySelectorAll("select")].map((control) => control.value)).toEqual(["5", "grounded_rule"]); expect([...container.querySelectorAll("input[type=number]")].map((input) => (input as HTMLInputElement).value)).toEqual(["300", "10"]);
    for (const control of container.querySelectorAll('select,input[type=number]')) expect(container.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
  });
  it.each([[0, "global_leaderboard_enabled", false], [1, "group_leaderboard_enabled", false], [2, "maintenance_mode_enabled", true]] as const)("keeps boolean setting %s payload", async (index, key, value) => {
    await render(<AdminCmsSettingsForm settings={[]} />); await click(container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[index]); expect(mocks.setting).toHaveBeenCalledWith({ key, value }); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("keeps numeric top-k and prompt string setting payloads", async () => {
    await render(<AdminCmsSettingsForm settings={[]} />); await select("7"); expect(mocks.setting).toHaveBeenLastCalledWith({ key: "default_rag_top_k", value: 7 }); await select("no_rule", 1); expect(mocks.setting).toHaveBeenLastCalledWith({ key: "default_rag_prompt_variant", value: "no_rule" });
  });
  it("saves both numeric targets on blur and allows zero", async () => {
    await render(<AdminCmsSettingsForm settings={settings} />); const inputs = container.querySelectorAll<HTMLInputElement>('input[type=number]'); enter(inputs[0], "900"); await blur(inputs[0]); expect(mocks.setting).toHaveBeenLastCalledWith({ key: "weekly_challenge_default_focus_minutes", value: 900 }); enter(inputs[1], "0"); await blur(inputs[1]); expect(mocks.setting).toHaveBeenLastCalledWith({ key: "weekly_challenge_default_completed_tasks", value: 0 });
  });
  it.each(["", "-1", "1.5"])("rejects invalid numeric draft '%s' without turning it into zero", async (value) => {
    await render(<AdminCmsSettingsForm settings={settings} />); const input = container.querySelector<HTMLInputElement>('input[type=number]')!; enter(input, value); await blur(input); expect(mocks.setting).not.toHaveBeenCalled(); expect(input.value).toBe("600"); expect(mocks.error).toHaveBeenCalledWith(messages.admin.settings.form.invalidNumber);
  });
  it("skips unchanged numeric blur and restores the saved value after failure", async () => {
    mocks.setting.mockResolvedValue({ success: false, message: "Rejected" }); await render(<AdminCmsSettingsForm settings={settings} />); const input = container.querySelector<HTMLInputElement>('input[type=number]')!; await blur(input); expect(mocks.setting).not.toHaveBeenCalled(); enter(input, "900"); await blur(input); expect(input.value).toBe("600"); expect(mocks.error).toHaveBeenCalledWith("Rejected"); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("disables CMS controls while saving and restores rejected boolean values", async () => {
    let resolve!: (value: { success: boolean; message: string }) => void; mocks.setting.mockReturnValue(new Promise((done) => { resolve = done; })); await render(<AdminCmsSettingsForm settings={[]} />); await click(container.querySelector<HTMLButtonElement>('[role="checkbox"]')!); expect(container.querySelector("fieldset")!.disabled).toBe(true); expect(container.querySelector("select")!.disabled).toBe(true); await act(async () => resolve({ success: false, message: "Rejected" })); expect(container.querySelector("fieldset")!.disabled).toBe(false); expect(container.querySelector('[role="checkbox"]')!.getAttribute("aria-checked")).toBe("true");
  });
  it("refreshes numeric display when server settings change and keeps Settings query", async () => {
    await render(await SettingsPage()); expect(mocks.settings).toHaveBeenCalledTimes(1); expect(container.querySelector<HTMLInputElement>('input[type=number]')!.value).toBe("600"); await render(<AdminCmsSettingsForm settings={settings} />); await render(<AdminCmsSettingsForm settings={[{ ...settings[0], value: 1200 }]} />); expect(container.querySelector<HTMLInputElement>('input[type=number]')!.value).toBe("1200"); expect(container.querySelector("main")).toBeNull();
  });
});
