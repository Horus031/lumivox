import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import type { Profile, PbiWeightProfile } from "../profile.types";
import { DEFAULT_PBI_WEIGHTS, initialCalibration, isCalibrationValid } from "../profile-calibration";
import { onboardingSchema } from "@/features/onboarding/onboarding.schemas";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), onboarding: vi.fn(), refresh: vi.fn(), error: vi.fn(), theme: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme: mocks.theme }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/features/settings/settings.actions", () => ({ updateSettingsAction: mocks.settings }));
vi.mock("@/features/onboarding/onboarding.actions", () => ({ completeOnboardingAction: mocks.onboarding }));

import { SettingsForm } from "@/features/settings/components/settings-form";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";

const profile = { full_name: "Người học", timezone: "Europe/Paris" } as Profile;
const weights = { task_completion_weight: 0.3, focus_quality_weight: 0.25, deadline_adherence_weight: 0.25, goal_momentum_weight: 0.1, consistency_weight: 0.1 } as PbiWeightProfile;

describe("calibration validation", () => {
  it("retains defaults, custom timezone and the existing sum tolerance", () => {
    const values = initialCalibration(profile, weights);
    expect(values.timezone).toBe("Europe/Paris"); expect(isCalibrationValid(values)).toBe(true);
    const near = { ...values, taskCompletionWeight: 0.30005 };
    expect(isCalibrationValid(near)).toBe(onboardingSchema.safeParse(near).success);
    expect(isCalibrationValid({ ...values, taskCompletionWeight: 0.301 })).toBe(false);
    expect(DEFAULT_PBI_WEIGHTS).toEqual({ taskCompletionWeight: 0.3, focusQualityWeight: 0.25, deadlineAdherenceWeight: 0.25, goalMomentumWeight: 0.1, consistencyWeight: 0.1 });
  });
  it.each([NaN, Infinity, -0.1, 1.1])("rejects nonfinite or out-of-range weight %s", (value) => {
    expect(isCalibrationValid({ ...initialCalibration(profile, weights), taskCompletionWeight: value })).toBe(false);
  });
});

describe("profile form controls", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  async function render(children: React.ReactNode) {
    await act(async () => root.render(<NextIntlClientProvider locale="vi" messages={messages} timeZone="UTC">{children}</NextIntlClientProvider>));
  }
  function enter(element: HTMLInputElement, value: string) {
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

  it.each(["settings", "onboarding"])("sends the unchanged %s payload with a custom stored timezone", async (mode) => {
    const action = mode === "settings" ? mocks.settings : mocks.onboarding;
    action.mockResolvedValue({ success: true, message: "OK" });
    await render(mode === "settings" ? <SettingsForm profile={profile} weights={weights} /> : <OnboardingForm profile={profile} weights={weights} />);
    expect(container.querySelector('[role="combobox"]')!.textContent).toContain("Europe/Paris");
    await submit(); expect(action).toHaveBeenCalledWith({ fullName: "Người học", timezone: "Europe/Paris", ...DEFAULT_PBI_WEIGHTS });
    expect(mocks.refresh).toHaveBeenCalledTimes(mode === "settings" ? 1 : 0);
  });

  it("labels each field, blocks invalid totals and resets only weights", async () => {
    await render(<SettingsForm profile={profile} weights={weights} />);
    const numeric = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    for (const field of numeric) { expect(container.querySelector(`label[for="${field.id}"]`)).not.toBeNull(); expect(field.getAttribute("aria-describedby")).toBeTruthy(); }
    enter(numeric[0], "0.4");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await submit(); expect(mocks.settings).not.toHaveBeenCalled();
    act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="${messages.settings.form.pbi.reset}"]`)!.click());
    expect(numeric[0].value).toBe("0.3"); expect(container.querySelector<HTMLInputElement>('input[autocomplete="name"]')!.value).toBe("Người học");
    expect(container.querySelector('[role="status"]')!.textContent).toBe("1,00 / 1,00");
  });

  it.each(["settings", "onboarding"])("retains %s values after rejected saving", async (mode) => {
    const action = mode === "settings" ? mocks.settings : mocks.onboarding; action.mockResolvedValue({ success: false, message: "Rejected" });
    await render(mode === "settings" ? <SettingsForm profile={profile} weights={weights} /> : <OnboardingForm profile={profile} weights={weights} />);
    const name = container.querySelector<HTMLInputElement>('input[autocomplete="name"]')!; enter(name, "Tên mới"); await submit();
    expect(name.value).toBe("Tên mới"); expect(container.querySelector("fieldset")!.disabled).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith("Rejected"); expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows native named theme radios and keeps theme out of the save payload", async () => {
    await render(<SettingsForm profile={profile} weights={weights} />);
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(3); expect(radios[2].checked).toBe(true);
    expect(radios[0].closest("label")!.textContent).toContain(messages.settings.theme.light);
    act(() => radios[1].click()); expect(mocks.theme).toHaveBeenCalledWith("dark");
  });
});
