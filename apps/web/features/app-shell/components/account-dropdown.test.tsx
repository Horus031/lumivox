import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/features/profiles/profile.types";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AccountDropdown } from "./account-dropdown";

describe("account dropdown sign out", () => {
  let container: HTMLDivElement;
  let root: Root;
  const submit = vi.fn((event: Event) => event.preventDefault());
  const profile = {
    full_name: "Test User",
    timezone: "Asia/Bangkok",
    role: "user",
  } as Profile;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    submit.mockClear();
    document.addEventListener("submit", submit);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<AccountDropdown profile={profile} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.removeEventListener("submit", submit);
  });

  it.each(["click", "Enter", " "])("submits sign out via %s", async (input) => {
    const trigger = container.querySelector("button")!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    });
    const button = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button).not.toBeNull();
    const form = button.form!;
    expect(form.getAttribute("action")).toBe("/auth/signout");
    expect(form.method).toBe("post");

    await act(async () => {
      if (input === "click") button.click();
      else button.dispatchEvent(new KeyboardEvent("keydown", { key: input, bubbles: true }));
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].target).toBe(form);
    expect(form.isConnected).toBe(true);
  });
});
