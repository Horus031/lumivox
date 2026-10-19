/** Phase 8: reporting-only metrics. No mutations and no reward calculations. */
export type FocusAnalyticsSession = {
  id: string;
  task_id: string | null;
  session_mode: string;
  status: string;
  planned_minutes: number;
  actual_focus_minutes: number;
  total_paused_seconds: number;
  started_at: string;
};
export type FocusAnalyticsSegment = {
  session_id: string;
  segment_kind: string;
  status: string;
  actual_seconds: number;
  total_paused_seconds: number;
};
export type FocusAnalyticsDistraction = {
  session_id: string;
  distraction_type: string;
  duration_seconds: number;
};
export type FocusAnalyticsReward = {
  id: string;
  token_delta: number;
};
export type FocusAnalyticsEngagement = {
  current_streak_days: number;
  longest_streak_days: number;
  token_balance: number;
  completed_focus_sessions_total: number;
} | null;
export type FocusAnalyticsInputs = {
  sessions: FocusAnalyticsSession[];
  segments: FocusAnalyticsSegment[];
  distractions: FocusAnalyticsDistraction[];
  rewards: FocusAnalyticsReward[];
  engagement: FocusAnalyticsEngagement;
  taskNames: Record<string, string>;
  startUtc: string;
  days: number;
  truncated: boolean;
};
export type FocusAnalyticsDaily = {
  date: string;
  focusSeconds: number;
  completedSessions: number;
};
export type FocusAnalyticsTask = {
  taskId: string;
  title: string;
  focusSeconds: number;
  sessionCount: number;
};
export type FocusV2AnalyticsReport = {
  startUtc: string;
  endUtcExclusive: string;
  days: number;
  truncated: boolean;
  sessionCount: number;
  activeSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  completionRatePercent: number;
  pomodoroSessions: number;
  completedRounds: number;
  focusSeconds: number;
  breakSeconds: number;
  pausedSeconds: number;
  distractionsCount: number;
  distractionSeconds: number;
  distractionTypes: Array<{ kind: string; count: number }>;
  rewardsCount: number;
  rewardTokens: number;
  engagement: FocusAnalyticsEngagement;
  daily: FocusAnalyticsDaily[];
  tasks: FocusAnalyticsTask[];
};

const terminalStatuses = new Set(["completed", "skipped", "interrupted"]);
const activeStatuses = new Set(["ongoing", "paused"]);

export function getUtcAnalyticsWindow(today: Date = new Date(), days = 30) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("Invalid reporting period");
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return {
    startUtc: new Date(midnight - (days - 1) * 86_400_000).toISOString(),
    endUtcExclusive: new Date(midnight + 86_400_000).toISOString(),
    days,
  };
}

export function buildFocusV2AnalyticsReport(input: FocusAnalyticsInputs): FocusV2AnalyticsReport {
  const { sessions, segments, distractions, rewards, engagement, taskNames, startUtc, days, truncated } = input;
  const start = Date.parse(startUtc);
  if (!Number.isFinite(start) || !Number.isInteger(days) || days < 1 || days > 90) throw new Error("Invalid analytics window");
  const end = start + days * 86_400_000;
  const dailyMap = new Map<string, FocusAnalyticsDaily>();
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
    dailyMap.set(date, { date, focusSeconds: 0, completedSessions: 0 });
  }
  const segmentMap = new Map<string, FocusAnalyticsSegment[]>();
  for (const segment of segments) {
    const bucket = segmentMap.get(segment.session_id) ?? [];
    bucket.push(segment);
    segmentMap.set(segment.session_id, bucket);
  }
  const tasks = new Map<string, FocusAnalyticsTask>();
  const sessionIds = new Set<string>();
  let activeSessions = 0;
  let completedSessions = 0;
  let cancelledSessions = 0;
  let completedRounds = 0;
  let focusSeconds = 0;
  let breakSeconds = 0;
  let pausedSeconds = 0;
  let pomodoroSessions = 0;
  for (const session of sessions) {
    const started = Date.parse(session.started_at);
    if (!Number.isFinite(started) || started < start || started >= end || sessionIds.has(session.id)) continue;
    sessionIds.add(session.id);
    if (activeStatuses.has(session.status)) activeSessions += 1;
    if (session.status === "completed") completedSessions += 1;
    if (session.status === "cancelled") cancelledSessions += 1;
    const isV2 = session.session_mode === "pomodoro";
    const ownSegments = segmentMap.get(session.id) ?? [];
    if (isV2) pomodoroSessions += 1;
    const focus = isV2
      ? ownSegments.filter(s => s.segment_kind === "focus" && terminalStatuses.has(s.status))
          .reduce((sum, s) => sum + Math.max(0, s.actual_seconds), 0)
      : Math.max(0, session.actual_focus_minutes) * 60;
    const breaks = isV2
      ? ownSegments.filter(s => s.segment_kind !== "focus" && terminalStatuses.has(s.status))
          .reduce((sum, s) => sum + Math.max(0, s.actual_seconds), 0)
      : 0;
    const rounds = isV2
      ? ownSegments.filter(s => s.segment_kind === "focus" && s.status === "completed").length
      : 0;
    // Closed pause seconds only. The currently open pause is intentionally excluded.
    pausedSeconds += Math.max(0, session.total_paused_seconds);
    completedRounds += rounds;
    focusSeconds += focus;
    breakSeconds += breaks;
    const date = new Date(started).toISOString().slice(0, 10);
    const day = dailyMap.get(date);
    if (day) {
      day.focusSeconds += focus;
      if (session.status === "completed") day.completedSessions += 1;
    }
    if (session.task_id) {
      const old = tasks.get(session.task_id) ?? {
        taskId: session.task_id, title: taskNames[session.task_id] ?? "", focusSeconds: 0, sessionCount: 0,
      };
      old.focusSeconds += focus;
      old.sessionCount += 1;
      tasks.set(session.task_id, old);
    }
  }
  const distractionTypes = new Map<string, number>();
  let distractionsCount = 0;
  let distractionSeconds = 0;
  for (const entry of distractions) {
    if (!sessionIds.has(entry.session_id)) continue;
    distractionsCount += 1;
    distractionSeconds += Math.max(0, entry.duration_seconds);
    distractionTypes.set(entry.distraction_type, (distractionTypes.get(entry.distraction_type) ?? 0) + 1);
  }
  const closed = completedSessions + cancelledSessions;
  return {
    startUtc,
    endUtcExclusive: new Date(end).toISOString(),
    days,
    truncated,
    sessionCount: sessionIds.size,
    activeSessions,
    completedSessions,
    cancelledSessions,
    completionRatePercent: closed > 0 ? Math.round(1000 * completedSessions / closed) / 10 : 0,
    pomodoroSessions,
    completedRounds,
    focusSeconds,
    breakSeconds,
    pausedSeconds,
    distractionsCount,
    distractionSeconds,
    distractionTypes: [...distractionTypes].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    rewardsCount: new Set(rewards.map(r => r.id)).size,
    rewardTokens: [...new Map(rewards.map(r => [r.id, r])).values()].reduce((sum, r) => sum + r.token_delta, 0),
    engagement,
    daily: [...dailyMap.values()],
    tasks: [...tasks.values()].sort((a, b) => b.focusSeconds - a.focusSeconds).slice(0, 8),
  };
}
