export type FocusEffortSource = {
  focusSessionId: string;
  studySessionId: string;
  mode: "legacy" | "pomodoro";
  status: "ongoing" | "paused" | "completed" | "cancelled";
  parentActualMinutes: number;
  segments: readonly {
    kind: "focus" | "short_break" | "long_break";
    status: "pending" | "running" | "paused" | "completed" | "skipped" | "interrupted";
    actualSeconds: number;
  }[];
};

export type StudyFocusEffort = {
  studySessionId: string;
  focusSessionCount: number;
  recordedSeconds: number;
  recordedMinutes: number;
  hasActiveFocus: boolean;
};

const incomplete = { success: false, code: "incompleteData" } as const;
const isDuration = (value: number) => Number.isSafeInteger(value) && value >= 0;

export function projectStudyFocusEffort(studyIds: readonly string[], sources: readonly FocusEffortSource[]):
  | { success: true; efforts: StudyFocusEffort[] }
  | typeof incomplete {
  const efforts = new Map<string, StudyFocusEffort>();
  for (const studySessionId of studyIds) {
    if (efforts.has(studySessionId)) return incomplete;
    efforts.set(studySessionId, { studySessionId, focusSessionCount: 0, recordedSeconds: 0, recordedMinutes: 0, hasActiveFocus: false });
  }
  const seen = new Set<string>();
  for (const source of sources) {
    const effort = efforts.get(source.studySessionId);
    if (!effort || seen.has(source.focusSessionId) || !isDuration(source.parentActualMinutes)) return incomplete;
    seen.add(source.focusSessionId);
    let seconds = source.mode === "legacy" ? source.parentActualMinutes * 60 : 0;
    if (source.mode === "pomodoro" && !source.segments.some(segment => segment.kind === "focus")) return incomplete;
    for (const segment of source.segments) {
      if (!isDuration(segment.actualSeconds) || (segment.status === "pending" && segment.actualSeconds !== 0)) return incomplete;
      if (source.mode === "pomodoro" && segment.kind === "focus") seconds += segment.actualSeconds;
    }
    effort.recordedSeconds += seconds;
    if (!isDuration(effort.recordedSeconds)) return incomplete;
    effort.focusSessionCount++;
    effort.hasActiveFocus ||= source.status === "ongoing" || source.status === "paused";
  }
  for (const effort of efforts.values()) effort.recordedMinutes = Math.floor(effort.recordedSeconds / 60);
  return { success: true, efforts: [...efforts.values()] };
}
