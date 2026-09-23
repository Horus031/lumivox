import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type TypedSupabaseClient = SupabaseClient<Database>;

function formatDayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

type DashboardActivityRpc = {
  summary: {
    completedTasks: number;
    completedSessions: number;
    totalFocusMinutes: number;
    distractionEvents: number;
  };
  behaviourTrend: Array<{
    dateKey: string;
    focusMinutes: number;
    distractions: number;
  }>;
  taskStatusBreakdown: Array<{
    status: string;
    count: number;
  }>;
};

export async function getDashboardActivityOverview(
  supabase: TypedSupabaseClient,
  days = 7,
) {
  const { data, error } = await supabase.rpc("get_my_dashboard_activity", {
    p_days: days,
  });

  if (error || !data) {
    throw new Error("Failed to fetch dashboard activity overview.");
  }

  const overview = data as unknown as DashboardActivityRpc;

  return {
    ...overview,
    behaviourTrend: overview.behaviourTrend.map((item) => ({
      ...item,
      label: formatDayLabel(item.dateKey),
    })),
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
        [
          "id",
          "standard_pbi",
          "personalized_pbi",
          "task_completion_rate",
          "focus_quality_score",
          "deadline_adherence_score",
          "goal_momentum_score",
          "consistency_score",
          "period_start",
          "period_end",
          "explanation_payload",
        ].join(","),
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
