import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FOCUS_V2_PREFERENCES } from "../focus-v2-preferences";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  launch: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "vi",
  useTranslations: () => (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("../focus-v2.actions", () => ({ createFocusV2SessionAction: mocks.create }));
vi.mock("../focus-v2-preferences.actions", () => ({ saveFocusV2PreferencesAction: mocks.save }));
vi.mock("@/features/learning-schedule/study-focus-launch.actions", () => ({
  startStudyFocusAction: mocks.launch,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), Link: "a" }));

import { FocusV2SessionBuilder } from "./focus-v2-session-builder";

describe("Focus V2 Session Builder UI", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount() {
    act(() =>
      root.render(
        <FocusV2SessionBuilder tasks={[]} initialPreferences={DEFAULT_FOCUS_V2_PREFERENCES} />,
      ),
    );
  }

  it("uses one launch key and locks settings until an uncertain outcome is reconciled", async () => {
    const studySessionId = "9b400000-0000-4000-8000-000000000001";
    mocks.launch
      .mockResolvedValueOnce({ success: false, code: "uncertain" })
      .mockResolvedValueOnce({ success: true, focusSessionId: studySessionId, replay: true });
    act(() =>
      root.render(
        <FocusV2SessionBuilder
          tasks={[]}
          initialPreferences={DEFAULT_FOCUS_V2_PREFERENCES}
          studyLaunch={{
            studySessionId,
            userId: "owner",
            task: { id: studySessionId, title: "Study Task" },
          }}
        />,
      ),
    );
    const submit = () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => {
      submit();
      submit();
    });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("uncertain");
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.disabled).toBe(true);
    await act(async () => {
      submit();
    });
    expect(mocks.launch.mock.calls[1]).toEqual(mocks.launch.mock.calls[0]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/focus");
  });
  function byText(text: string) {
    const button = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.trim().includes(text),
    );
    if (!button) throw new Error(`Missing button ${text}`);
    return button;
  }

  it("previews the default schedule without the final break", () => {
    mount();
    expect(container.textContent).toContain("115");
    expect(container.querySelectorAll("ol li")).toHaveLength(7);
    expect(byText("presets.classic").getAttribute("aria-pressed")).toBe("true");
  });

  it("applies the Deep Work preset and updates the schedule immediately", () => {
    mount();
    act(() => byText("presets.deepWork").click());
    expect(container.querySelectorAll("ol li")).toHaveLength(3);
    expect(container.textContent).toContain("195");
    expect(byText("presets.deepWork").getAttribute("aria-pressed")).toBe("true");
  });

  it("saves defaults without task identity", async () => {
    mocks.save.mockResolvedValue({ success: true, message: "saved", data: null });
    mount();
    await act(async () => byText("saveDefaults").click());
    expect(mocks.save).toHaveBeenCalledWith(DEFAULT_FOCUS_V2_PREFERENCES);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a session and navigates to the working Phase 3 timer", async () => {
    mocks.create.mockResolvedValue({
      success: true,
      message: "created",
      data: { sessionId: "session" },
    });
    mount();
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      taskId: "",
      ...DEFAULT_FOCUS_V2_PREFERENCES,
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("never navigates when the backend rejects creation", async () => {
    mocks.create.mockResolvedValue({ success: false, message: "active session" });
    mount();
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(mocks.error).toHaveBeenCalledWith("active session");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
