import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toggle: vi.fn(), preview: vi.fn(), update: vi.fn(), controller: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: { value?: number }) =>
  values?.value !== undefined ? `${key}: ${values.value}` : key }));
vi.mock("../use-focus-v2-audio", () => ({ useFocusV2Audio: mocks.controller }));
import { FocusV2AudioPanel } from "./focus-v2-audio-panel";

const projection = {
  phase: "running", current: { id: "current", segment_kind: "focus" }, next: null,
  elapsedSeconds: 0, remainingSeconds: 1200, progressPercent: 10, isDue: false,
} as Parameters<typeof FocusV2AudioPanel>[0]["projection"];

const settings = { sound: "brown", volume: 35, muted: false, cuesEnabled: true,
  cueVolume: 50, playDuringBreak: false };

describe("Focus V2 audio controls", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.controller.mockReturnValue({ settings, hydrated: true, enabled: false,
      error: null, toggleAudio: mocks.toggle, previewCue: mocks.preview, updateSettings: mocks.update });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const mount = () => act(() => root.render(<FocusV2AudioPanel sessionId="sid" projection={projection} />));
  it("does not enable sound during the initial render", () => {
    mount();
    expect(mocks.toggle).not.toHaveBeenCalled();
    expect(container.querySelector('button[aria-pressed="false"]')).not.toBeNull();
  });
  it("requires explicit click to unlock playback", () => {
    mount();
    const button = container.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!;
    act(() => button.click());
    expect(mocks.toggle).toHaveBeenCalledOnce();
  });
  it("updates selection without contacting any server", () => {
    mount();
    const select = container.querySelector<HTMLSelectElement>("select")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "pink");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.update).toHaveBeenCalledWith({ sound: "pink" });
  });
  it("disables cue preview while audio remains locked", () => {
    mount();
    const preview = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("previewCue"))!;
    expect(preview.disabled).toBe(true);
  });
});
