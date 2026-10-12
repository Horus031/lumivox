import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/vi.json";
import type { TaskWithGoal } from "../task.types";
import type { Goal } from "@/features/goals/goal.types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), createGoal: vi.fn(), updateGoal: vi.fn(), refresh: vi.fn(), saved: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("../task.actions", () => ({ createTaskAction: mocks.create, updateTaskAction: mocks.update }));
vi.mock("@/features/goals/goal.actions", () => ({ createGoalAction: mocks.createGoal, updateGoalAction: mocks.updateGoal }));
vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { Dialog: Wrapper, DialogTrigger: Wrapper, DialogClose: Wrapper, DialogContent: Wrapper, DialogTitle: Wrapper, DialogDescription: Wrapper, DialogFooter: Wrapper };
});
vi.mock("./task-modal-shell", () => ({ TaskModalShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/popover", () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { Popover: Wrapper, PopoverTrigger: Wrapper, PopoverContent: Wrapper };
});
vi.mock("@/components/ui/calendar", () => ({ Calendar: ({ onSelect }: { onSelect: (date: Date | undefined) => void }) => <><button type="button" data-date onClick={() => onSelect(new Date(2026, 9, 20))}>Date fixture</button><button type="button" data-clear onClick={() => onSelect(undefined)}>Clear fixture</button></> }));

import { TaskEditForm } from "./task-edit-form";
import { CreateTaskModal } from "./create-task-modal";
import { CreateGoalForm } from "@/features/goals/components/create-goal.form";

describe("task form presentation and payloads", () => {
  let container: HTMLDivElement;
  let root: Root;
  const task = { id: "task", title: "Study", description: "Notes", goal_id: "goal", priority: "high", estimated_minutes: 30,
    due_at: "2026-10-20T08:30:00Z", status: "in_review", updated_at: "2026-10-12T08:00:00Z" } as TaskWithGoal;
  const goals = [{ id: "goal", title: "Algebra" }];
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  function render(children: React.ReactNode) { act(() => root.render(<NextIntlClientProvider locale="vi" messages={messages} timeZone="UTC">{children}</NextIntlClientProvider>)); }
  function enter(element: HTMLInputElement, value: string) {
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

  it("preserves workflow status and optimistic edit guards", async () => {
    mocks.update.mockResolvedValue({ success: true, message: "Saved" });
    render(<TaskEditForm task={task} goals={goals} onSaved={mocks.saved} onCancel={vi.fn()} />);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
    await submit();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ taskId: task.id, goalId: "goal", status: "in_review", expectedStatus: "in_review", expectedUpdatedAt: task.updated_at, dueAt: new Date(task.due_at!).toISOString() }));
    expect(mocks.saved).toHaveBeenCalledOnce();
  });

  it("keeps scoped goal linkage when changing goals is disabled", async () => {
    mocks.update.mockResolvedValue({ success: true, message: "Saved" });
    render(<TaskEditForm task={task} goals={goals} allowGoalChange={false} onSaved={mocks.saved} onCancel={vi.fn()} />);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(1);
    enter(container.querySelector('input[type="number"]')!, "");
    await submit();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ goalId: "goal", estimatedMinutes: undefined }));
  });

  it("combines selected dates with due time and allows clearing the date", async () => {
    mocks.update.mockResolvedValue({ success: false, message: "Rejected" });
    render(<TaskEditForm task={task} goals={goals} onSaved={mocks.saved} onCancel={vi.fn()} />);
    enter(container.querySelector('input[type="time"]')!, "16:45:00");
    act(() => container.querySelector<HTMLButtonElement>("[data-date]")!.click());
    await submit();
    expect(mocks.update.mock.calls[0][0].dueAt).toBe(new Date(2026, 9, 20, 16, 45).toISOString());
    act(() => container.querySelector<HTMLButtonElement>("[data-clear]")!.click());
    await submit();
    expect(mocks.update.mock.calls[1][0].dueAt).toBe("");
  });

  it("retains fields and restores editing after rejection", async () => {
    mocks.update.mockResolvedValue({ success: false, message: "Rejected" });
    render(<TaskEditForm task={task} goals={goals} onSaved={mocks.saved} onCancel={vi.fn()} />);
    enter(container.querySelector('input:not([type])')!, "Revised");
    await submit();
    expect(container.querySelector<HTMLInputElement>('input:not([type])')!.value).toBe("Revised");
    expect(container.querySelector("fieldset")!.disabled).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith("Rejected");
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it("selects the unlinked default and labels each creation field", async () => {
    mocks.create.mockResolvedValue({ success: true, message: "Created" });
    render(<CreateTaskModal goals={goals} />);
    expect(container.querySelectorAll('[role="combobox"]')[0].textContent).toContain(messages.tasks.form.noGoal);
    for (const input of container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
      expect(input.id).not.toBe("");
      expect(container.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
    enter(container.querySelector('input:not([type])')!, "New task");
    await submit();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ title: "New task", goalId: "", dueAt: "", estimatedMinutes: undefined }));
  });

  it("creates goals with optional local dates and unchanged type", async () => {
    mocks.createGoal.mockResolvedValue({ success: true, message: "Created" });
    render(<CreateGoalForm />);
    enter(container.querySelector("input")!, "New goal");
    act(() => container.querySelector<HTMLButtonElement>("[data-date]")!.click());
    await submit();
    expect(mocks.createGoal).toHaveBeenCalledWith({ title: "New goal", description: "", goalType: "short_term", startDate: "2026-10-20", targetDate: "" });
    expect(container.querySelector("input")!.value).toBe("");
  });

  it("keeps goal edit status and existing dates after rejected saving", async () => {
    mocks.updateGoal.mockResolvedValue({ success: false, message: "Rejected" });
    const goal = { id: "goal", title: "Existing", description: "Notes", goal_type: "long_term", status: "paused", start_date: "2026-10-12", target_date: "2026-10-20" } as Goal;
    render(<CreateGoalForm mode="edit" goal={goal} />);
    await submit();
    expect(mocks.updateGoal).toHaveBeenCalledWith({ goalId: "goal", title: "Existing", description: "Notes", goalType: "long_term", status: "paused", startDate: "2026-10-12", targetDate: "2026-10-20" });
    expect(container.querySelector("input")!.value).toBe("Existing");
    expect(container.querySelector("fieldset")!.disabled).toBe(false);
  });
});
