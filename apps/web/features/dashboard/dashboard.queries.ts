import type { TypedSupabaseClient } from "@/types/database.types";

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

export async function getDashboardActivityOverview(
  supabase: TypedSupabaseClient,
  days = 7,
) {
  const dateKeys = getRollingDateKeys(days);
  const firstDate = `${dateKeys[0]}T00:00:00.000Z`;

  // These three datasets cover summary cards, behaviour trend and task-status
  // distribution. Fetch each dataset once and derive all dashboard projections
  // in memory instead of issuing overlapping queries for the same rows.
  const [tasksResult, sessionsResult, distractionsResult] = await Promise.all([
    supabase.from("tasks").select("status, completed_at"),
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

  if (tasksResult.error || sessionsResult.error || distractionsResult.error) {
    throw new Error("Failed to fetch dashboard activity overview.");
  }

  const focusMap = new Map<string, number>();
  const distractionMap = new Map<string, number>();

  for (const key of dateKeys) {
    focusMap.set(key, 0);
    distractionMap.set(key, 0);
  }

  let totalFocusMinutes = 0;

  for (const session of sessionsResult.data ?? []) {
    totalFocusMinutes += session.actual_focus_minutes ?? 0;

    if (!session.ended_at) continue;

    const key = session.ended_at.slice(0, 10);
    if (!focusMap.has(key)) continue;

    focusMap.set(
      key,
      (focusMap.get(key) ?? 0) + (session.actual_focus_minutes ?? 0),
    );
  }

  for (const distraction of distractionsResult.data ?? []) {
    const key = distraction.occurred_at.slice(0, 10);
    if (!distractionMap.has(key)) continue;
    distractionMap.set(key, (distractionMap.get(key) ?? 0) + 1);
  }

  const taskCounts = {
    todo: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0,
    cancelled: 0,
  };

  let completedTasks = 0;

  for (const task of tasksResult.data ?? []) {
    taskCounts[task.status] += 1;

    if (
      task.status === "completed" &&
      task.completed_at &&
      task.completed_at >= firstDate
    ) {
      completedTasks += 1;
    }
  }

  return {
    summary: {
      completedTasks,
      completedSessions: sessionsResult.data?.length ?? 0,
      totalFocusMinutes,
      distractionEvents: distractionsResult.data?.length ?? 0,
    },
    behaviourTrend: dateKeys.map((dateKey) => ({
      dateKey,
      label: formatDayLabel(dateKey),
      focusMinutes: focusMap.get(dateKey) ?? 0,
      distractions: distractionMap.get(dateKey) ?? 0,
    })),
    taskStatusBreakdown: [
      { status: "Todo", count: taskCounts.todo },
      { status: "In Progress", count: taskCounts.in_progress },
      { status: "Completed", count: taskCounts.completed },
      { status: "Overdue", count: taskCounts.overdue },
      { status: "Cancelled", count: taskCounts.cancelled },
    ],
  };
}

export async function getDashboardPbiOverview(
  supabase: TypedSupabaseClient,
  limit = 8,
) {
  const [latestResult, historyResult] = await Promise.all([
    supabase
      .from("pbi_snapshots")
      .select(
        `
          id,
          standard_pbi,
          personalized_pbi,
          task_completion_rate,
          focus_quality_score,
          deadline_adherence_score,
          goal_momentum_score,
          consistency_score,
          period_start,
          period_end,
          explanation_payload
        `,
      )
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pbi_snapshots")
      .select("period_end,standard_pbi,personalized_pbi")
      .order("period_end", { ascending: false })
      .limit(limit),
  ]);

  if (latestResult.error || historyResult.error) {
    throw new Error("Failed to fetch PBI dashboard data.");
  }

  const pbiHistory = [...(historyResult.data ?? [])]
    .reverse()
    .map((snapshot) => ({
      label: snapshot.period_end,
      standardPbi: Number(snapshot.standard_pbi),
      personalizedPbi: Number(snapshot.personalized_pbi),
    }));

  return {
    latestSnapshot: latestResult.data,
    pbiHistory,
  };
}
