import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/features/profiles/profile.types";

const route = vi.hoisted(() => ({ pathname: "/vi/workspace/tasks/example" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next-intl", () => ({
  useLocale: () => "vi",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/components/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/features/theme/theme-switcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("./account-dropdown", () => ({ AccountDropdown: () => null }));

import { AppNavigation } from "./app-navigation";
import { AppShellFrame } from "./app-shell-frame";

describe("app shell navigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.localStorage.clear();
    route.pathname = "/vi/workspace/tasks/example";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("marks nested routes as current and labels collapsed links", () => {
    act(() => root.render(<AppNavigation />));
    const current = container.querySelector('a[aria-current="page"]')!;
    expect(current.getAttribute("href")).toBe("/workspace");
    expect(current.getAttribute("aria-label")).toBe("workspace.label");
    expect(container.querySelectorAll("a")).toHaveLength(8);
  });

  it("keeps secondary mobile destinations accessible in More", async () => {
    route.pathname = "/vi/groups/example";
    act(() => root.render(<AppNavigation variant="mobile" />));
    expect(container.querySelectorAll("a")).toHaveLength(4);
    const trigger = container.querySelector("button")!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    });
    const items = document.querySelectorAll('[role="menuitem"]');
    expect(Array.from(items, (item) => item.getAttribute("href")))
      .toEqual(["/rooms", "/groups", "/leaderboard", "/reflections"]);
    expect(document.querySelector('[role="menuitem"][aria-current="page"]')?.getAttribute("href"))
      .toBe("/groups");
  });

  it("restores and toggles the persisted sidebar with accessible state", async () => {
    window.localStorage.setItem("lumivox-sidebar-collapsed", "true");
    await act(async () => root.render(
      <AppShellFrame profile={{ full_name: "Test User" } as Profile}
        sidebar={<aside id="desktop-sidebar" />}>
        <h1>Workspace</h1>
      </AppShellFrame>,
    ));
    const trigger = container.querySelector("button")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe("desktop-sidebar");
    expect(container.querySelector('[data-sidebar-collapsed="true"]')).not.toBeNull();
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(window.localStorage.getItem("lumivox-sidebar-collapsed")).toBe("false");
    expect(container.querySelector("h1")?.textContent).toBe("Workspace");
  });
});
