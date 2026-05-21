import { requireUser } from "@/lib/auth/require-user";

export async function getLatestPbiSnapshot() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("pbi_snapshots")
    .select("*")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch latest PBI snapshot: ${error.message}`);
  }

  return data;
}

export async function getDashboardSummary() {
  const { supabase } = await requireUser();

  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 6);

  const sevenDaysAgoIso = sevenDaysAgo.toISOString();

  const [
    completedTasksResult,
    completedSessionsResult,
    distractionEventsResult,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgoIso),

    supabase
      .from("focus_sessions")
      .select("actual_focus_minutes")
      .eq("status", "completed")
      .gte("ended_at", sevenDaysAgoIso),

    supabase
      .from("distraction_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", sevenDaysAgoIso),
  ]);

  if (
    completedTasksResult.error ||
    completedSessionsResult.error ||
    distractionEventsResult.error
  ) {
    throw new Error("Failed to fetch dashboard summary.");
  }

  const totalFocusMinutes = (completedSessionsResult.data ?? []).reduce(
    (sum, session) => sum + (session.actual_focus_minutes ?? 0),
    0,
  );

  return {
    completedTasks: completedTasksResult.count ?? 0,
    completedSessions: completedSessionsResult.data?.length ?? 0,
    totalFocusMinutes,
    distractionEvents: distractionEventsResult.count ?? 0,
  };
}

function getRollingDateKeys(days = 7) {
  const dates: string[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);

    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

function formatDayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export async function getBehaviourTrend(days = 7) {
  const { supabase } = await requireUser();

  const dateKeys = getRollingDateKeys(days);

  const firstDate = `${dateKeys[0]}T00:00:00.000Z`;

  const [sessionsResult, distractionsResult] = await Promise.all([
    supabase
      .from("focus_sessions")
      .select("actual_focus_minutes, ended_at")
      .eq("status", "completed")
      .gte("ended_at", firstDate),

    supabase
      .from("distraction_events")
      .select("occurred_at")
      .gte("occurred_at", firstDate),
  ]);

  if (sessionsResult.error || distractionsResult.error) {
    throw new Error("Failed to fetch behaviour trend.");
  }

  const focusMap = new Map<string, number>();
  const distractionMap = new Map<string, number>();

  for (const key of dateKeys) {
    focusMap.set(key, 0);
    distractionMap.set(key, 0);
  }

  for (const session of sessionsResult.data ?? []) {
    if (!session.ended_at) continue;

    const key = session.ended_at.slice(0, 10);

    if (focusMap.has(key)) {
      focusMap.set(
        key,
        (focusMap.get(key) ?? 0) + (session.actual_focus_minutes ?? 0),
      );
    }
  }

  for (const distraction of distractionsResult.data ?? []) {
    const key = distraction.occurred_at.slice(0, 10);

    if (distractionMap.has(key)) {
      distractionMap.set(key, (distractionMap.get(key) ?? 0) + 1);
    }
  }

  return dateKeys.map((dateKey) => ({
    dateKey,
    label: formatDayLabel(dateKey),
    focusMinutes: focusMap.get(dateKey) ?? 0,
    distractions: distractionMap.get(dateKey) ?? 0,
  }));
}

export async function getPbiSnapshotHistory(limit = 8) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("pbi_snapshots")
    .select(
      `
      period_start,
      period_end,
      standard_pbi,
      personalized_pbi,
      created_at
      `
    )
    .order("period_end", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch PBI history: ${error.message}`);
  }

  return data.map((snapshot) => ({
    label: snapshot.period_end,
    standardPbi: Number(snapshot.standard_pbi),
    personalizedPbi: Number(snapshot.personalized_pbi),
  }));
}

export async function getTaskStatusBreakdown() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tasks")
    .select("status");

  if (error) {
    throw new Error(`Failed to fetch task status breakdown: ${error.message}`);
  }

  const counts = {
    todo: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0,
    cancelled: 0,
  };

  for (const task of data ?? []) {
    counts[task.status] += 1;
  }

  return [
    {
      status: "Todo",
      count: counts.todo,
    },
    {
      status: "In Progress",
      count: counts.in_progress,
    },
    {
      status: "Completed",
      count: counts.completed,
    },
    {
      status: "Overdue",
      count: counts.overdue,
    },
    {
      status: "Cancelled",
      count: counts.cancelled,
    },
  ];
}
