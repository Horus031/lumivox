import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTranslator, NextIntlClientProvider, useLocale } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import messages from "@/messages/vi.json";

const mocks = vi.hoisted(() => ({ pathname: "/vi/admin", metrics: vi.fn(), users: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...props }: React.ComponentProps<"a">) => {
  const locale = useLocale();
  return <a href={`/${locale}${href}`} {...props}>{children}</a>;
} }));
vi.mock("@/features/admin/admin.queries", () => ({ getAdminDashboardMetrics: mocks.metrics, getAdminRecentUsers: mocks.users }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "vi", getTranslations: async (namespace: "admin.dashboard") => createTranslator({ locale: "vi", messages, namespace }) }));

import { AdminSectionTabs } from "./admin-section-tabs";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminRecentUsersTable } from "./admin-recent-users-table";
import AdminDashboardPage from "@/app/[locale]/(protected)/admin/page";

const user = { user_id: "12345678-abcd", full_name: "Full name", display_name: "Display name", role: "admin", leaderboard_opt_in: true, created_at: null, last_sign_in_at: null };

describe("admin overview UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); mocks.pathname = "/vi/admin";
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  async function render(children: ReactNode, locale = "vi") {
    await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? messages : en} timeZone="UTC" onError={(error) => { throw error; }}>{children}</NextIntlClientProvider>));
  }

  it.each([
    ["/vi/admin", "/vi/admin"],
    ["/vi/admin/users/user-id", "/vi/admin/users"],
    ["/en/admin/documents/doc-id", "/en/admin/documents"],
    ["/vi/admin/ai/sessions/session-id", "/vi/admin/ai"],
    ["/vi/admin/ai/translations", "/vi/admin/ai/translations"],
    ["/vi/admin/native-task-risk/prediction-id", "/vi/admin/native-task-risk"],
    ["/vi/admin/settings", "/vi/admin/settings"],
  ])("marks exactly one current navigation link for %s", async (pathname, expected) => {
    mocks.pathname = pathname; await render(<AdminSectionTabs />, pathname.startsWith("/en/") ? "en" : "vi");
    expect(container.querySelectorAll("nav a")).toHaveLength(9);
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')!.getAttribute("href")).toBe(expected);
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector("nav")!.getAttribute("aria-label")).toBeTruthy();
  });

  it("retains name precedence, role, visibility, null dates and localized detail links", async () => {
    await render(<AdminRecentUsersTable users={[user, { ...user, user_id: "abcdef12", display_name: null, leaderboard_opt_in: false }, { ...user, user_id: "fallback-id", display_name: null, full_name: null }]} />);
    const links = container.querySelectorAll("tbody a");
    expect([...links].map((link) => link.textContent)).toEqual(["Display name", "Full name", "User fallback"]);
    expect(links[0].getAttribute("href")).toBe("/vi/admin/users/12345678-abcd");
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(5);
    expect(container.textContent).toContain(messages.admin.common.visibility.visible);
    expect(container.textContent).toContain(messages.admin.common.visibility.hidden);
    expect(container.textContent).toContain(messages.admin.common.roles.admin);
    const region = container.querySelector<HTMLElement>('[role="region"]')!;
    expect(region.tabIndex).toBe(0); expect(document.getElementById(region.getAttribute("aria-labelledby")!)!.textContent).toBe(messages.admin.users.recentTable.title);
    expect(container.querySelector("tbody tr td:last-child")!.textContent).toBe(messages.admin.common.na);
  });

  it("renders an unframed empty state without a useless scroll region", async () => {
    await render(<AdminRecentUsersTable users={[]} />);
    expect(container.textContent).toContain(messages.admin.users.recentTable.empty);
    expect(container.querySelector("table")).toBeNull(); expect(container.querySelector('[role="region"]')).toBeNull();
  });

  it("keeps metric values and optional descriptions with shared compact tokens", async () => {
    await render(<><AdminMetricCard label="Metric" value="123,456,789" description="Description" /><AdminMetricCard label="Zero" value={0} /></>);
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(container.querySelector("article")!.className).toContain("rounded-lg");
    expect(container.querySelectorAll("article p")).toHaveLength(5);
    expect(container.textContent).toContain("123,456,789"); expect(container.textContent).toContain("Zero0");
  });

  it("preserves dashboard queries, all ten metrics and null-to-zero fallback", async () => {
    mocks.metrics.mockResolvedValue({ total_users: 12345, completed_tasks: 7 }); mocks.users.mockResolvedValue([user]);
    await render(await AdminDashboardPage());
    expect(mocks.metrics).toHaveBeenCalledTimes(1); expect(mocks.users).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("article")).toHaveLength(10);
    expect(container.querySelector("h1")!.textContent).toBe(messages.admin.dashboard.title);
    expect(container.querySelector("article")!.textContent).toContain(new Intl.NumberFormat("vi").format(12345));
    expect(container.querySelectorAll("article")[1].textContent).toContain("0");
    expect(container.querySelector("main")).toBeNull();
  });
});
