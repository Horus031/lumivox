import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
import { getStudyFocusEffortAction } from "./study-focus-effort.queries.actions";

const uuid = (n: number) => `9c000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const study = uuid(1), task = uuid(2), user = uuid(3);
const input = { studySessionIds: [study] };
const parent = (i: number) => ({ id: uuid(1000 + i), user_id: user, task_id: task,
  actual_focus_minutes: 1, status: "completed", session_mode: "legacy", plan: null });
const link = (i: number) => ({ id: uuid(2000 + i), user_id: user, task_id: task, study_session_id: study, focus_session_id: parent(i).id });
type Row = Record<string, unknown> & { id: string };
type Page = { count: number | null; data: Row[] | null; error: unknown };
type Query = { table: string; from: number; to: number; ids: string[]; owner: string };
let records: Record<string, Row[]>;
let requests: Query[];
let alter: (q: Query, r: Page) => Page;

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  records = { task_study_sessions: [{ id: study, user_id: user, task_id: task }],
    task_study_focus_attributions: [link(1)], focus_sessions: [parent(1)] };
  alter = (_q, r) => r;
  mocks.auth.mockResolvedValue({ user: { id: user }, supabase: { from(table: string) {
    const query: Query = { table, from: 0, to: 0, ids: [], owner: "" };
    let column = "id";
    const chain = {
      select: () => chain,
      eq: (_field: string, value: string) => { query.owner = value; return chain; },
      in: (field: string, ids: string[]) => { column = field; query.ids = ids; return chain; },
      order: () => chain,
      range: (from: number, to: number) => { query.from = from; query.to = to; return chain; },
      abortSignal: async () => {
        requests.push(query);
        const rows = records[table].filter(row => query.ids.includes(String(row[column])));
        return alter(query, { count: rows.length, data: rows.slice(query.from, query.to + 1), error: null });
      },
    };
    return chain;
  } } });
});

describe("owner-scoped effort read", () => {
  it("deduplicates batch input and reads 201 links with exact-count paging", async () => {
    records.task_study_focus_attributions = Array.from({ length: 201 }, (_, i) => link(i));
    records.focus_sessions = Array.from({ length: 201 }, (_, i) => parent(i));
    expect(await getStudyFocusEffortAction({ studySessionIds: [study, study] })).toMatchObject({ success: true,
      source: "persisted-focus-records", efforts: [{ focusSessionCount: 201, recordedSeconds: 12060 }],
    });
    expect(requests.filter(q => q.table === "task_study_focus_attributions").map(q => [q.from, q.to]))
      .toEqual([[0, 199], [200, 399], [0, 199], [200, 399]]);
    expect(requests.every(q => q.owner === user)).toBe(true);
  });
  it("rejects a short page from the backend even if rows could be partially summed", async () => {
    records.task_study_focus_attributions = Array.from({ length: 201 }, (_, i) => link(i));
    alter = (q, r) => q.table === "task_study_focus_attributions" ? { ...r, data: r.data!.slice(0, 100) } : r;
    expect(await getStudyFocusEffortAction(input)).toEqual({ success: false, code: "incompleteData" });
  });
  it("returns no data for a hidden Study", async () => {
    records.task_study_sessions = [];
    expect(await getStudyFocusEffortAction(input)).toEqual({ success: false, code: "notAuthorized" });
    expect(requests).toHaveLength(1);
  });
  it.each(["missing parent", "wrong task", "wrong owner", "missing segment", "changed links", "cap"])("fails closed on %s", async fault => {
    const p = parent(1);
    if (fault === "missing parent") records.focus_sessions = [];
    if (fault === "wrong task") records.focus_sessions = [{ ...p, task_id: uuid(9) }];
    if (fault === "wrong owner") records.focus_sessions = [{ ...p, user_id: uuid(9) }];
    if (fault === "missing segment") records.focus_sessions = [{ ...p, session_mode: "pomodoro", plan: { round_count: 1, segments: [] } }];
    if (fault === "changed links") alter = (q, r) => q.table === "task_study_focus_attributions" && requests.length > 2 ? { ...r, data: [], count: 0 } : r;
    if (fault === "cap") alter = (q, r) => q.table === "task_study_focus_attributions" ? { ...r, count: 4001 } : r;
    expect(await getStudyFocusEffortAction(input)).toEqual({ success: false, code: "incompleteData" });
  });
  it("distinguishes a database failure from a complete zero", async () => {
    records.task_study_focus_attributions = [];
    expect(await getStudyFocusEffortAction(input)).toMatchObject({ success: true, efforts: [{ recordedSeconds: 0 }] });
    alter = (_q, r) => ({ ...r, error: new Error("database failed") });
    expect(await getStudyFocusEffortAction(input)).toEqual({ success: false, code: "loadFailed" });
  });
});
