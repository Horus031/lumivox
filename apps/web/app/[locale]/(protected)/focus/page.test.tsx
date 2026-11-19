import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FocusPage from "./page";

const mocks = vi.hoisted(() => ({
  tasks: vi.fn(),
  active: vi.fn(),
  activeV2: vi.fn(),
  v2Enabled: vi.fn(),
  from: vi.fn(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/features/tasks/task.queries", () => ({ getAvailableFocusTasks: mocks.tasks }));
vi.mock("@/features/focus-sessions/focus-session.queries", () => ({
  getActiveFocusSession: mocks.active,
}));
vi.mock("@/features/focus-sessions/focus-v2.queries", () => ({
  getActiveFocusV2Snapshot: mocks.activeV2,
}));
vi.mock("@/features/focus-sessions/focus-v2-release", () => ({
  isFocusV2CreationEnabled: mocks.v2Enabled,
}));
vi.mock("@/features/focus-sessions/focus-v2-preferences.queries", () => ({
  getFocusV2Preferences: async () => ({}),
}));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ supabase: { from: mocks.from }, user: { id: "owner" } }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ Link: "a" }));
vi.mock("@/features/app-shell/components/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/features/learning-documents/learning-document.queries", () => ({
  getAccessibleProcessedLearningDocuments: vi.fn(),
}));
vi.mock("@/features/cms-settings/cms-settings.queries", () => ({ getRagDefaultSettings: vi.fn() }));
vi.mock("@/features/rag/components/rag-study-assistant", () => ({ RagStudyAssistant: () => null }));
vi.mock("@/features/focus-sessions/components/active-focus-session-panel", () => ({
  ActiveFocusSessionPanel: () => <div data-active="legacy" />,
}));
vi.mock("@/features/focus-sessions/components/focus-v2-lifecycle-view", () => ({
  FocusV2LifecycleView: () => <div data-active="v2" />,
}));

type FormProps = {
  tasks: Array<{ id: string; title: string }>;
  initialTaskId?: string;
  studyLaunch?: { studySessionId: string };
};

const renderOptions = ({ tasks, initialTaskId, studyLaunch }: FormProps) => (
  <select defaultValue={initialTaskId ?? ""} data-study-session={studyLaunch?.studySessionId}>
    <option value="">None</option>
    {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
  </select>
);

vi.mock("@/features/focus-sessions/components/start-focus-session-form", () => ({
  StartFocusSessionForm: (props: FormProps) => renderOptions(props),
}));
vi.mock("@/features/focus-sessions/components/focus-v2-session-builder", () => ({
  FocusV2SessionBuilder: (props: FormProps) => renderOptions(props),
}));

const task = { id: "ab400000-0000-4000-8000-000000000001", title: "Linked task" };
const studySession = "ab400000-0000-4000-8000-000000000002";

async function renderPage(params: Awaited<Parameters<typeof FocusPage>[0]["searchParams"]>) {
  return renderToStaticMarkup(await FocusPage({ searchParams: Promise.resolve(params) }));
}

describe("Focus task deep links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FOCUS_V2_ENABLED", "true");
    mocks.tasks.mockResolvedValue([]);
    mocks.active.mockResolvedValue(null);
    mocks.activeV2.mockResolvedValue(null);
    mocks.v2Enabled.mockReturnValue(false);
    mocks.from.mockReturnValue(mocks);
    mocks.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("selects an available task in the legacy form without an extra read", async () => {
    mocks.tasks.mockResolvedValue([task]);
    expect(await renderPage({ taskId: task.id.toUpperCase() })).toContain('selected="">Linked task');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("adds an owned task outside the first 100 options to the V2 form", async () => {
    mocks.v2Enabled.mockReturnValue(true);
    mocks.tasks.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({ id: String(index), title: "Other task" })),
    );
    mocks.maybeSingle.mockResolvedValue({ data: task, error: null });
    expect(await renderPage({ taskId: task.id })).toContain('selected="">Linked task');
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("tasks");
    expect(mocks.eq.mock.calls).toEqual([["id", task.id], ["user_id", "owner"]]);
    expect(mocks.in).toHaveBeenCalledExactlyOnceWith("status", ["todo", "in_progress", "overdue"]);
  });

  it("leaves the selection empty when the owner filter finds no matching task", async () => {
    expect(await renderPage({ taskId: task.id })).toContain('selected="">None');
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
  });

  it.each([{ taskId: "bad-uuid" }, { taskId: [task.id, task.id] }])(
    "ignores an invalid taskId $taskId",
    async ({ taskId }) => {
      expect(await renderPage({ taskId })).toContain('selected="">None');
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it.each(["legacy", "v2"])("keeps an active %s session in view", async (mode) => {
    const session = { id: "active", task_id: "active-task" };
    if (mode === "legacy") mocks.active.mockResolvedValue(session);
    else mocks.activeV2.mockResolvedValue({ session });
    expect(await renderPage({ taskId: task.id })).toContain(`data-active="${mode}"`);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("keeps studySession launch ahead of taskId", async () => {
    mocks.v2Enabled.mockReturnValue(true);
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { id: studySession, task_id: "study-task" }, error: null })
      .mockResolvedValueOnce({ data: { id: "study-task", title: "Study task" }, error: null });

    const html = await renderPage({ studySession, taskId: task.id });
    expect(html).toContain(`data-study-session="${studySession}"`);
    expect(mocks.from.mock.calls).toEqual([["task_study_sessions"], ["tasks"]]);
    expect(mocks.eq).not.toHaveBeenCalledWith("id", task.id);
  });
});
