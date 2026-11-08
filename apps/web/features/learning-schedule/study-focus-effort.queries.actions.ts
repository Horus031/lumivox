"use server";

import { studyPlanTiming } from "./study-plan-timing";

import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import type { Database } from "@/types/database.types";
import { projectStudyFocusEffort, type FocusEffortSource, type StudyFocusEffort } from "./study-focus-effort";

const inputSchema = z.object({ studySessionIds: z.array(z.uuid().transform(id => id.toLowerCase())).max(2000) }).strict();
const duration = z.number().int().nonnegative();
const parentSchema = z.object({
  id: z.uuid(), user_id: z.uuid(), task_id: z.uuid(), actual_focus_minutes: duration,
  session_mode: z.enum(["legacy", "pomodoro"]), status: z.enum(["ongoing", "paused", "completed", "cancelled"]),
});
const segmentSchema = z.object({
  id: z.uuid(), session_id: z.uuid(), position: z.number().int().min(1).max(15),
  segment_kind: z.enum(["focus", "short_break", "long_break"]),
  status: z.enum(["pending", "running", "paused", "completed", "skipped", "interrupted"]),
  actual_seconds: duration, planned_seconds: duration, started_at: z.string().nullable(),
});
const planSchema = z.object({
  round_count: z.number().int().min(1).max(8),
  segments: z.array(segmentSchema).max(15),
});
const LINK_CAP = 4000;
// UUID filters stay below common proxy URL limits at this batch size.
const CHUNK = 120;
type Code = "invalidInput" | "notAuthorized" | "loadFailed" | "incompleteData";
type Result = { success: true; source: "persisted-focus-records"; asOf: string; efforts: StudyFocusEffort[] }
  | { success: false; code: Code };
class ReadFailure extends Error {
  constructor(readonly code: Code) { super(code); }
}
function complete(condition: unknown): asserts condition {
  if (!condition) throw new ReadFailure("incompleteData");
}
function chunks(ids: string[]) {
  return Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ids.slice(i * CHUNK, (i + 1) * CHUNK));
}
type Page<T> = { data: T[] | null; count: number | null; error: unknown };
type LinkRow = Pick<Database["public"]["Tables"]["task_study_focus_attributions"]["Row"],
  "id" | "user_id" | "task_id" | "study_session_id" | "focus_session_id">;
async function readPages<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>, cap: number, pageSize: number,
) {
  const rows: T[] = [], seen = new Set<string>();
  let total: number | undefined;
  for (let from = 0; ; from += pageSize) {
    const { data, count, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new ReadFailure("loadFailed");
    complete(data && count !== null && count >= 0 && count <= cap && (total === undefined || total === count));
    total = count;
    complete(data.length === Math.min(pageSize, count - from));
    for (const row of data) {
      complete(!seen.has(row.id));
      seen.add(row.id);
      rows.push(row);
    }
    if (rows.length === count) return rows;
  }
}

/** Owner-scoped best-effort read across multiple PostgREST snapshots. */
export async function getStudyFocusEffortAction(raw: unknown): Promise<Result> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { success: false, code: "invalidInput" };
  const timing = studyPlanTiming("effort");
  const auth = await requireUser().catch(() => null);
  timing.mark("auth");
  if (!auth) return { success: false, code: "notAuthorized" };
  const { supabase, user } = auth;
  const studyIds = [...new Set(parsed.data.studySessionIds)];
  const studyChunks = chunks(studyIds);
  const signal = AbortSignal.timeout(15_000);
  try {
    const taskByStudy = new Map<string, string>();
    for (const ids of studyChunks) {
      const rows = await readPages((from, to) => supabase.from("task_study_sessions")
        .select("id,user_id,task_id", { count: "exact" }).eq("user_id", user.id).in("id", ids)
        .order("id").range(from, to).abortSignal(signal), ids.length, CHUNK);
      if (rows.length !== ids.length) return { success: false, code: "notAuthorized" };
      for (const row of rows) {
        complete(row.user_id === user.id && ids.includes(row.id));
        taskByStudy.set(row.id, row.task_id);
      }
    }

    timing.mark("ownership");
    async function readLinks() {
      const all: LinkRow[] = [];
      const seen = new Set<string>();
      for (const ids of studyChunks) {
        const rows = await readPages((from, to) => supabase.from("task_study_focus_attributions")
          .select("id,user_id,task_id,study_session_id,focus_session_id", { count: "exact" })
          .eq("user_id", user.id).in("study_session_id", ids).order("id").range(from, to).abortSignal(signal),
        LINK_CAP - all.length, 200);
        for (const row of rows) {
          complete(row.user_id === user.id && ids.includes(row.study_session_id)
            && row.task_id === taskByStudy.get(row.study_session_id) && !seen.has(row.focus_session_id));
          seen.add(row.focus_session_id);
          all.push(row);
        }
      }
      return all;
    }
    const links = await readLinks();
    timing.mark("links");
    const linkByFocus = new Map(links.map(link => [link.focus_session_id, link]));
    const sources: FocusEffortSource[] = [];
    for (const ids of chunks([...linkByFocus.keys()])) {
      // Embed children to keep each parent, plan and its segments in one DB
      // snapshot. The immutable round count detects incomplete child results.
      const rows = await readPages((from, to) => supabase.from("focus_sessions")
        .select("id,user_id,task_id,session_mode,status,actual_focus_minutes,plan:focus_session_plans(round_count,segments:focus_session_segments(id,session_id,position,segment_kind,status,actual_seconds,planned_seconds,started_at))", { count: "exact" })
        .eq("user_id", user.id).in("id", ids).order("id").range(from, to).abortSignal(signal), ids.length, CHUNK);
      complete(rows.length === ids.length);
      for (const row of rows) {
        const parent = parentSchema.safeParse(row);
        const link = linkByFocus.get(row.id);
        complete(parent.success && link && ids.includes(row.id) && row.user_id === user.id && row.task_id === link.task_id);
        const mode = parent.data.session_mode;
        const segments: FocusEffortSource["segments"][number][] = [];
        if (mode === "pomodoro") {
          const plan = planSchema.safeParse(row.plan);
          complete(plan.success && plan.data.segments.length === 2 * plan.data.round_count - 1);
          const ordered = [...plan.data.segments].sort((a, b) => a.position - b.position);
          complete(new Set(ordered.map(segment => segment.id)).size === ordered.length);
          for (const [index, segment] of ordered.entries()) {
            complete(segment.session_id === row.id && segment.position === index + 1
              && (segment.segment_kind === "focus") === (index % 2 === 0)
              && segment.actual_seconds <= segment.planned_seconds
              && (segment.started_at !== null || segment.actual_seconds === 0));
            segments.push({ kind: segment.segment_kind, status: segment.status, actualSeconds: segment.actual_seconds });
          }
        } else complete(row.plan === null);
        sources.push({ focusSessionId: row.id, studySessionId: link.study_session_id, mode, status: parent.data.status,
          parentActualMinutes: parent.data.actual_focus_minutes, segments });
      }
    }

    timing.mark("parents");
    const confirmed = await readLinks();
    timing.mark("confirmLinks");
    complete(confirmed.length === links.length && confirmed.every((row, i) =>
      row.id === links[i].id && row.focus_session_id === links[i].focus_session_id && row.study_session_id === links[i].study_session_id));
    const projection = projectStudyFocusEffort(studyIds, sources);
    timing.mark("projection");
    return projection.success ? { ...projection, source: "persisted-focus-records", asOf: new Date().toISOString() } : projection;
  } catch (error) {
    return { success: false, code: error instanceof ReadFailure ? error.code : "loadFailed" };
  } finally {
    timing.finish();
  }
}
