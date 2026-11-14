
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";

import {
  TASK_RISK_UI_ACTIONS,
  TASK_RISK_UI_FIXTURES,
} from "../task-risk-ui.fixtures";

import { TaskRiskIndicator } from "./task-risk-indicator";
import { TaskRiskRecoveryPanel } from "./task-risk-recovery-panel";
import { TaskRiskSummary } from "./task-risk-summary";

function fixture(id: string) {
  const result = TASK_RISK_UI_FIXTURES.find(
    (item) => item.id === id,
  );

  if (!result) {
    throw new Error(`Unknown fixture: ${id}`);
  }

  return result.state;
}

describe("Task Risk UI Foundation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, {
      IS_REACT_ACT_ENVIRONMENT: true,
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(
    content: ReactNode,
    locale: "en" | "vi" = "en",
  ) {
    act(() => {
      root.render(
        <NextIntlClientProvider
          locale={locale}
          messages={locale === "en" ? en : viMessages}
          timeZone="UTC"
        >
          {content}
        </NextIntlClientProvider>,
      );
    });
  }

  it.each(["en", "vi"] as const)(
    "renders localized high-risk labels in %s",
    (locale) => {
      render(
        <TaskRiskIndicator state={fixture("high")} />,
        locale,
      );

      const messages =
        locale === "en"
          ? en.taskRiskRecovery
          : viMessages.taskRiskRecovery;

      expect(container.textContent).toContain(
        messages.status.high,
      );
    },
  );

  it("does not show warnings for low-risk or ineligible tasks", () => {
    render(
      <TaskRiskIndicator state={fixture("low")} />,
    );

    expect(
      container.querySelector("[data-task-risk-indicator]"),
    ).toBeNull();

    render(
      <TaskRiskIndicator state={fixture("ineligible")} />,
    );

    expect(
      container.querySelector("[data-task-risk-indicator]"),
    ).toBeNull();
  });

  it("distinguishes loading and stale states", () => {
    render(
      <TaskRiskIndicator state={fixture("loading")} />,
    );

    expect(
      container.querySelector(
        '[data-task-risk-indicator="loading"]',
      ),
    ).not.toBeNull();

    render(
      <TaskRiskIndicator state={fixture("stale")} />,
    );

    expect(
      container.querySelector(
        '[data-task-risk-indicator="stale"]',
      ),
    ).not.toBeNull();
  });

  it("hides the previous probability when a snapshot is stale", () => {
    render(
      <TaskRiskSummary state={fixture("high")} />,
    );

    expect(container.textContent).toContain("76%");

    render(
      <TaskRiskSummary state={fixture("stale")} />,
    );

    expect(
      container.querySelector(
        '[data-risk-view-state="stale"]',
      ),
    ).not.toBeNull();

    expect(container.textContent).not.toContain("76%");
    expect(container.textContent).not.toContain(
      "Deadline is approaching",
    );
  });

  it("shows a moderate band without claiming certain lateness", () => {
    render(
      <TaskRiskSummary state={fixture("moderate")} />,
    );

    expect(container.textContent).toContain(
      en.taskRiskRecovery.status.moderate,
    );

    expect(container.textContent).toContain("37%");
    expect(container.textContent).toContain(
      en.taskRiskRecovery.summary.disclaimer,
    );
  });

  it("disables actions when no callback is provided", () => {
    render(
      <TaskRiskRecoveryPanel
        state={fixture("high")}
        actions={TASK_RISK_UI_ACTIONS}
      />,
    );

    const buttons =
      container.querySelectorAll<HTMLButtonElement>(
        "[data-risk-action]",
      );

    expect(buttons.length).toBe(
      TASK_RISK_UI_ACTIONS.length,
    );

    for (const button of buttons) {
      expect(button.disabled).toBe(true);
    }
  });

  it("emits requests only for enabled actions", () => {
    const onActionRequested = vi.fn();

    render(
      <TaskRiskRecoveryPanel
        state={fixture("high")}
        actions={TASK_RISK_UI_ACTIONS}
        onActionRequested={onActionRequested}
      />,
    );

    const focusButton =
      container.querySelector<HTMLButtonElement>(
        '[data-risk-action="start_focus"]',
      );

    const scheduleButton =
      container.querySelector<HTMLButtonElement>(
        '[data-risk-action="increase_study_frequency"]',
      );

    expect(focusButton).not.toBeNull();
    expect(scheduleButton).not.toBeNull();
    expect(focusButton!.disabled).toBe(false);
    expect(scheduleButton!.disabled).toBe(true);

    act(() => focusButton!.click());

    expect(onActionRequested).toHaveBeenCalledOnce();
    expect(onActionRequested).toHaveBeenCalledWith(
      TASK_RISK_UI_ACTIONS[0],
    );

    act(() => scheduleButton!.click());

    expect(onActionRequested).toHaveBeenCalledOnce();
  });

  it("never exposes recovery actions for stale or low-risk states", () => {
    render(
      <TaskRiskRecoveryPanel
        state={fixture("stale")}
        actions={TASK_RISK_UI_ACTIONS}
        onActionRequested={vi.fn()}
      />,
    );

    expect(
      container.querySelector("[data-risk-action]"),
    ).toBeNull();

    render(
      <TaskRiskRecoveryPanel
        state={fixture("low")}
        actions={TASK_RISK_UI_ACTIONS}
        onActionRequested={vi.fn()}
      />,
    );

    expect(
      container.querySelector("[data-risk-action]"),
    ).toBeNull();
  });
});
