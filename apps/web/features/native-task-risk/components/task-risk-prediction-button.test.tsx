import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";
import { TASK_RISK_UI_FIXTURES } from "../task-risk-ui.fixtures";
import { TaskRiskPredictionButton } from "./task-risk-prediction-button";
import type { TaskRiskPredictionResult } from "../task-risk-prediction.actions";

const predict = vi.hoisted(() => vi.fn());
vi.mock("../task-risk-prediction.actions", () => ({ predictTaskRiskAction: predict }));
const ready = TASK_RISK_UI_FIXTURES.find(item => item.id === "high")!.state;
let container: HTMLDivElement;
let root: Root;
const onPredicted = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

function render(taskId = "task-a", stale = false, locale: "en" | "vi" = "en") {
  act(() => root.render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : viMessages} timeZone="UTC">
      <TaskRiskPredictionButton key={taskId} taskId={taskId} stale={stale} onPredicted={onPredicted} />
    </NextIntlClientProvider>,
  ));
}

it.each(["en", "vi"] as const)("localizes create and stale refresh labels in %s", locale => {
  const messages = locale === "en" ? en : viMessages;
  render("task-a", false, locale);
  expect(container.textContent).toContain(messages.taskRiskRecovery.prediction.create);
  render("task-a", true, locale);
  expect(container.textContent).toContain(messages.taskRiskRecovery.prediction.refresh);
});

it("blocks rapid double clicks, shows pending, and delivers the persisted state", async () => {
  let finish!: (value: TaskRiskPredictionResult) => void;
  predict.mockReturnValue(new Promise<TaskRiskPredictionResult>(resolve => { finish = resolve; }));
  render();
  act(() => { container.querySelector("button")!.click(); container.querySelector("button")!.click(); });
  expect(predict).toHaveBeenCalledExactlyOnceWith("task-a");
  expect(container.querySelector("button")!.disabled).toBe(true);
  expect(container.textContent).toContain(en.taskRiskRecovery.prediction.pending);
  await act(async () => { finish({ success: true, state: ready as Extract<typeof ready, { status: "ready" }> }); });
  expect(onPredicted).toHaveBeenCalledWith(ready);
});

it.each(["limited", "unavailable", "ineligible"] as const)("shows %s and allows a retry", async error => {
  predict.mockResolvedValue({ success: false, error });
  render();
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector('[role="status"]')?.textContent).toBe(en.taskRiskRecovery.prediction[error]);
  expect(container.querySelector("button")!.disabled).toBe(false);
  expect(onPredicted).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(predict).toHaveBeenCalledTimes(2);
});

it("handles a rejected action without exposing its message", async () => {
  predict.mockRejectedValue(new Error("private backend detail"));
  render();
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain(en.taskRiskRecovery.prediction.unavailable);
  expect(container.textContent).not.toContain("private backend detail");
});

it("discards an old task response after the keyed button switches tasks", async () => {
  let finish!: (value: TaskRiskPredictionResult) => void;
  predict.mockReturnValue(new Promise<TaskRiskPredictionResult>(resolve => { finish = resolve; }));
  render("task-a");
  act(() => container.querySelector("button")!.click());
  render("task-b");
  await act(async () => { finish({ success: true, state: ready as Extract<typeof ready, { status: "ready" }> }); });
  expect(onPredicted).not.toHaveBeenCalled();
  expect(container.querySelector("button")!.disabled).toBe(false);
});
