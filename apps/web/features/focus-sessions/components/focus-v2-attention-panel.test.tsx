import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusV2Projection } from "../focus-v2.types";

const mocks = vi.hoisted(() => ({ log: vi.fn(), success: vi.fn(), error: vi.fn(), hook: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("../focus-v2-distractions.actions", () => ({ logFocusV2DistractionAction: mocks.log }));
vi.mock("../use-focus-v2-attention", () => ({ useFocusV2Attention: mocks.hook }));
import { FocusV2AttentionPanel } from "./focus-v2-attention-panel";

const sessionId = "11111111-1111-4111-8111-111111111111";
const focus = { phase: "running", current: { id: "f1", segment_kind: "focus" }, next: null } as FocusV2Projection;
const breakTime = { phase: "running", current: { id: "b1", segment_kind: "short_break" }, next: null } as FocusV2Projection;
let root: Root;
let node: HTMLDivElement;
const dismiss = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.hook.mockReturnValue({
    settings: { notificationsEnabled: false, pageAwayPromptEnabled: false, minimumAwaySeconds: 30 },
    hydrated: true, permission: "default", permissionError: null, awayCandidate: null,
    updateSettings: vi.fn(), enableNotifications: vi.fn(), dismissAwayCandidate: dismiss,
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(() => { act(() => root.unmount()); node.remove(); });

function mount(projection: FocusV2Projection) {
  act(() => root.render(<FocusV2AttentionPanel sessionId={sessionId} projection={projection} />));
}
function saveButton() {
  return [...node.querySelectorAll("button")].find((button) => button.textContent?.includes("save"))!;
}

describe("Focus V2 attention panel", () => {
  it("never enables manual logging during a break", () => {
    mount(breakTime);
    expect(saveButton().disabled).toBe(true);
  });
  it("inserts user-confirmed manual event during a focus round", async () => {
    mocks.log.mockResolvedValue({ success: true, message: "saved", data: null });
    mount(focus);
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.log).toHaveBeenCalledWith({
      sessionId, distractionType: "other", durationSeconds: 0, note: "",
    });
    expect(mocks.success).toHaveBeenCalledWith("saved");
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it("never plays success cue on server failure", async () => {
    mocks.log.mockResolvedValue({ success: false, message: "stale" });
    const cue = vi.fn();
    window.addEventListener("lumivox:focus-v2-distraction-saved", cue);
    mount(focus);
    await act(async () => node.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.error).toHaveBeenCalledWith("stale");
    expect(cue).not.toHaveBeenCalled();
    window.removeEventListener("lumivox:focus-v2-distraction-saved", cue);
  });
  it("only prefills suggested page-away duration after explicit acceptance", () => {
    mocks.hook.mockReturnValue({
      settings: { notificationsEnabled: false, pageAwayPromptEnabled: true, minimumAwaySeconds: 30 },
      hydrated: true, permission: "default", permissionError: null,
      awayCandidate: { segmentId: "f1", durationSeconds: 72 },
      updateSettings: vi.fn(), enableNotifications: vi.fn(), dismissAwayCandidate: dismiss,
    });
    mount(focus);
    const accept = [...node.querySelectorAll("button")].find((b) => b.textContent?.includes("useAwayDuration"))!;
    act(() => accept.click());
    expect(node.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("72");
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
