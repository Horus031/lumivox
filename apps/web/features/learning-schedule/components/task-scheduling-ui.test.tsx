import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceTask } from "@/features/workspace/workspace.test-fixtures";
import type { TaskWithGoal } from "@/features/tasks/task.types";
import { generateStudyOccurrences, type StudyScheduleInput } from "../schedule-engine";

const mocks = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), details: vi.fn(),
  remove: vi.fn(), refresh: vi.fn(), error: vi.fn(), success: vi.fn(), confirm: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("../schedule.actions", () => ({ createStudyScheduleAction: mocks.create }));
vi.mock("../schedule.queries.actions", () => ({ getTaskStudyScheduleAction: mocks.load }));
vi.mock("@/features/tasks/task.actions", () => ({ getTaskDetailsAction: mocks.details, deleteTaskAction: mocks.remove }));
vi.mock("@/components/ui/use-confirm-dialog", () => ({ useConfirmDialog: () => mocks.confirm }));
vi.mock("@/features/tasks/components/task-modal-shell", () => ({
  TaskModalShell: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <div>{children}{footer}</div>,
}));
vi.mock("@/features/tasks/components/task-edit-form", () => ({ TaskEditForm: () => <div>Task edit form</div> }));
vi.mock("@/features/tasks/components/task-documents-panel", () => ({ TaskDocumentsPanel: () => null }));
vi.mock("@/features/tasks/components/task-subtasks-panel", () => ({ TaskSubtasksPanel: () => null }));
vi.mock("@/features/task-review/components/task-review-panel", () => ({ TaskReviewPanel: () => null }));

import { TaskStudyScheduleSection } from "./task-study-schedule-section";
import { ScheduleDraftEditor } from "./schedule-draft-editor";
import { TaskDetailsDrawer } from "@/features/tasks/components/task-details-drawer";

const a = workspaceTask();
const b = workspaceTask({ id: "00000000-0000-4000-8000-000000000003", title: "Task B" });
const draft: StudyScheduleInput = { startsOn: "2030-01-07", endsOn: "2030-01-21", timezone: "UTC",
  slots: [{ weekday: 1, startTime: "19:00", endTime: "20:30" }] };
const summary = { id: "schedule-a", task_id: a.id, status: "active", revision: 1,
  starts_on: "2030-01-07", ends_on: "2030-01-21", timezone: "UTC" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Task scheduling UI", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    mocks.load.mockResolvedValue({ success: true, schedule: null });
    mocks.details.mockImplementation(async (id: string) => ({ success: true,
      data: { task: id === a.id ? a : b, subtasks: [], documents: [] } }));
    mocks.confirm.mockResolvedValue(true);
    mocks.remove.mockResolvedValue({ success: true, message: "Deleted" });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  async function render(node: ReactNode) { await act(async () => { root.render(node); }); }
  function button(text: string) {
    const result = [...host.querySelectorAll("button")].find(x => x.textContent?.trim() === text);
    expect(result, `Missing button ${text}`).toBeDefined(); return result!;
  }
  async function click(text: string) { await act(async () => { button(text).click(); }); }
  function enter(label: string, value: string, index = 0) {
    const labels = [...host.querySelectorAll("label")].filter(x => x.querySelector("span")?.textContent === label);
    const input = labels[index].querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  const drawer = (task: TaskWithGoal) => <TaskDetailsDrawer task={task} goals={[]} onClose={() => {}} initialTab="overview" />;

  it("4.1 renders engine preview and passes the same valid draft without mutations", async () => {
    const next = vi.fn();
    await render(<ScheduleDraftEditor initialValue={draft} onContinue={next} />);
    const expected = generateStudyOccurrences(draft);
    expect(host.querySelectorAll("li")).toHaveLength(expected.length);
    for (const x of expected) expect(host.textContent).toContain(`${x.localDate} · ${x.localStartTime}–${x.localEndTime}`);
    await click("Continue"); expect(next).toHaveBeenCalledWith(draft);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled();
  });
  it("4.1 adds, edits and removes slots, showing overlap and recovering", async () => {
    await render(<ScheduleDraftEditor initialValue={draft} onContinue={vi.fn()} />);
    await click("Add weekly slot");
    expect(host.querySelectorAll('button[aria-label^="Remove slot"]')).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Overlapping/);
    expect(button("Continue").disabled).toBe(true);
    enter("Start", "21:00", 1); enter("End", "22:00", 1);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelectorAll("li")).toHaveLength(6);
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Remove slot 2"]')!.click(); });
    expect(host.querySelectorAll("li")).toHaveLength(3);
  });
  it.each([
    ["End date", "2029-01-01", /Schedule must cover/],
    ["IANA timezone", "Bad/Zone", /Invalid IANA/],
  ] as const)("4.1 rejects invalid %s", async (label, value, message) => {
    await render(<ScheduleDraftEditor initialValue={draft} onContinue={vi.fn()} />);
    enter(label, value);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(message);
    expect(button("Continue").disabled).toBe(true);
  });
  it("4.1 rejects a DST gap and disables empty previews or missing callback", async () => {
    await render(<ScheduleDraftEditor initialValue={{ startsOn: "2030-03-10", endsOn: "2030-03-10",
      timezone: "America/New_York", slots: [{ weekday: 7, startTime: "02:30", endTime: "04:00" }] }} onContinue={vi.fn()} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Nonexistent/);
    expect(button("Continue").disabled).toBe(true);
    await render(<ScheduleDraftEditor key="no-matching-day" initialValue={{ ...draft,
      startsOn: "2030-01-08", endsOn: "2030-01-08" }} onContinue={vi.fn()} />);
    expect(host.textContent).toContain("No sessions match this date range.");
    expect(button("Continue").disabled).toBe(true);
    await render(<ScheduleDraftEditor key="empty" initialValue={{ ...draft, endsOn: "2030-01-07", slots: [] }} onContinue={vi.fn()} />);
    expect(button("Continue").disabled).toBe(true);
    await render(<ScheduleDraftEditor key="no-callback" initialValue={draft} />);
    expect(button("Continue").disabled).toBe(true);
  });
  it.each(["todo", "in_progress"] as const)("4.2 root %s exposes creation in overview and hides it while editing", async status => {
    const task = workspaceTask({ status });
    mocks.details.mockResolvedValue({ success: true, data: { task, subtasks: [], documents: [] } });
    await render(drawer(task));
    expect(button("Add study schedule")).toBeDefined();
    await click("edit"); expect(host.textContent).toContain("Task edit form");
    expect(host.querySelector('[aria-label="Task study schedule"]')).toBeNull();
    await click("cancel"); expect(button("Add study schedule")).toBeDefined();
  });
  it.each(["completed", "cancelled", "in_review"] as const)("4.2 %s cannot create", async status => {
    const task = workspaceTask({ status });
    mocks.details.mockResolvedValue({ success: true, data: { task, subtasks: [], documents: [] } });
    await render(drawer(task));
    expect(host.textContent).toContain("Study scheduling is not available");
    expect(host.textContent).not.toContain("Add study schedule");
  });
  it("4.2 subtask cannot create and an existing schedule is summary-only", async () => {
    const task = workspaceTask({ parent_task_id: b.id });
    mocks.details.mockResolvedValue({ success: true, data: { task, subtasks: [], documents: [] } });
    await render(drawer(task)); expect(host.textContent).not.toContain("Add study schedule");
    mocks.load.mockResolvedValue({ success: true, schedule: summary });
    await render(<TaskStudyScheduleSection key="summary" taskId={a.id} eligible />);
    expect(host.textContent).toContain("Revision: 1");
    expect(host.textContent).not.toContain("Add study schedule");
  });
  it("4.2 RPC rejection retains editor and edited draft, then successful retry loads summary", async () => {
    mocks.create.mockResolvedValueOnce({ success: false, message: "Rejected by RPC" })
      .mockResolvedValueOnce({ success: true, scheduleId: summary.id, sessionCount: 3 });
    await render(<TaskStudyScheduleSection taskId={a.id} eligible />);
    await click("Add study schedule");
    enter("Start date", "2030-01-07"); enter("End date", "2030-01-21");
    act(() => {
      const weekday = host.querySelector("select")!;
      weekday.value = "1"; weekday.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("Continue");
    expect(mocks.error).toHaveBeenCalledWith("Rejected by RPC");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Rejected by RPC");
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe("2030-01-07");
    expect(host.querySelector('[aria-label="Study schedule editor"]')).not.toBeNull();
    mocks.load.mockResolvedValue({ success: true, schedule: summary });
    await click("Continue");
    expect(host.textContent).toContain("Revision: 1");
    expect(mocks.success).toHaveBeenCalledWith("Created 3 study sessions.");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("4.2 two immediate Continue clicks make one request; disabled fieldset covers keyboard", async () => {
    const pending = deferred<{ success: false; message: string }>();
    mocks.create.mockReturnValue(pending.promise);
    await render(<TaskStudyScheduleSection taskId={a.id} eligible />);
    await click("Add study schedule");
    await act(async () => { const next = button("Continue"); next.click(); next.click(); });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLFieldSetElement>('fieldset[aria-busy="true"]')!.disabled).toBe(true);
    await act(async () => { pending.resolve({ success: false, message: "Retry" }); });
  });
  it("4.2 Task switch remounts schedule state and ignores old Task details arriving late", async () => {
    const old = deferred<unknown>(); const newer = deferred<unknown>();
    mocks.details.mockImplementation((id: string) => id === a.id ? old.promise : newer.promise);
    mocks.load.mockImplementation(async (id: string) => ({ success: true, schedule: id === a.id ? summary : null }));
    await render(drawer(a)); expect(host.textContent).toContain("Revision: 1");
    // Check the immediate render too, before effects clear old detail state.
    act(() => { root.render(drawer(b)); });
    expect(host.textContent).not.toContain("Revision: 1");
    await act(async () => { newer.resolve({ success: true, data: { task: b, subtasks: [], documents: [] } }); });
    await act(async () => { old.resolve({ success: true, data: { task: a, subtasks: [], documents: [] } }); });
    expect(host.textContent).not.toContain("Revision: 1");
    expect(button("Add study schedule")).toBeDefined();
    await click("deleteTask"); expect(mocks.remove).toHaveBeenCalledWith(b.id);
  });
});
