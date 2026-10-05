CREATE OR REPLACE FUNCTION public.get_my_dashboard_activity(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH params AS (
  SELECT
    (SELECT auth.uid()) AS user_id,
    GREATEST(1, LEAST(COALESCE(p_days, 7), 31)) AS days
),
date_bounds AS (
  SELECT p.user_id, p.days,
    (CURRENT_DATE - (p.days - 1))::date AS first_date
  FROM params p
),
dates AS (
  SELECT generate_series(b.first_date, CURRENT_DATE, interval '1 day')::date AS day
  FROM date_bounds b
),
task_stats AS (
  SELECT
    COUNT(*) FILTER (
      WHERE t.status = 'completed'
        AND t.completed_at >= b.first_date::timestamptz
    )::int AS completed_tasks,
    COUNT(*) FILTER (
      WHERE t.status = 'todo'
        AND NOT (t.due_at IS NOT NULL AND t.due_at < now())
    )::int AS todo_count,
    COUNT(*) FILTER (
      WHERE t.status IN ('in_progress', 'overdue')
        AND NOT (t.due_at IS NOT NULL AND t.due_at < now())
    )::int AS in_progress_count,
    COUNT(*) FILTER (WHERE t.status = 'in_review')::int AS in_review_count,
    COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_count,
    COUNT(*) FILTER (
      WHERE t.status NOT IN ('completed', 'cancelled', 'in_review')
        AND t.due_at IS NOT NULL AND t.due_at < now()
    )::int AS overdue_count,
    COUNT(*) FILTER (WHERE t.status = 'cancelled')::int AS cancelled_count
  FROM date_bounds b
  LEFT JOIN public.tasks t ON t.user_id = b.user_id
),
focus_by_day AS (
  SELECT f.ended_at::date AS day,
    COUNT(*)::int AS completed_sessions,
    COALESCE(SUM(f.actual_focus_minutes), 0)::int AS focus_minutes
  FROM date_bounds b
  JOIN public.focus_sessions f
    ON f.user_id = b.user_id AND f.status = 'completed'
   AND f.ended_at >= b.first_date::timestamptz
  GROUP BY f.ended_at::date
),
focus_totals AS (
  SELECT COALESCE(SUM(completed_sessions), 0)::int AS completed_sessions,
    COALESCE(SUM(focus_minutes), 0)::int AS total_focus_minutes
  FROM focus_by_day
),
distraction_by_day AS (
  SELECT d.occurred_at::date AS day, COUNT(*)::int AS distractions
  FROM date_bounds b
  JOIN public.distraction_events d
    ON d.user_id = b.user_id AND d.occurred_at >= b.first_date::timestamptz
  GROUP BY d.occurred_at::date
),
distraction_totals AS (
  SELECT COALESCE(SUM(distractions), 0)::int AS distraction_events
  FROM distraction_by_day
),
trend AS (
  SELECT jsonb_agg(jsonb_build_object(
    'dateKey', to_char(dt.day, 'YYYY-MM-DD'),
    'focusMinutes', COALESCE(f.focus_minutes, 0),
    'distractions', COALESCE(d.distractions, 0)
  ) ORDER BY dt.day) AS items
  FROM dates dt
  LEFT JOIN focus_by_day f ON f.day = dt.day
  LEFT JOIN distraction_by_day d ON d.day = dt.day
)
SELECT jsonb_build_object(
  'summary', jsonb_build_object(
    'completedTasks', ts.completed_tasks,
    'completedSessions', ft.completed_sessions,
    'totalFocusMinutes', ft.total_focus_minutes,
    'distractionEvents', dst.distraction_events
  ),
  'behaviourTrend', COALESCE(tr.items, '[]'::jsonb),
  'taskStatusBreakdown', jsonb_build_array(
    jsonb_build_object('status', 'Todo', 'count', ts.todo_count),
    jsonb_build_object('status', 'In Progress', 'count', ts.in_progress_count),
    jsonb_build_object('status', 'In Review', 'count', ts.in_review_count),
    jsonb_build_object('status', 'Completed', 'count', ts.completed_count),
    jsonb_build_object('status', 'Overdue', 'count', ts.overdue_count),
    jsonb_build_object('status', 'Cancelled', 'count', ts.cancelled_count)
  )
)
FROM task_stats ts
CROSS JOIN focus_totals ft
CROSS JOIN distraction_totals dst
CROSS JOIN trend tr;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_dashboard_activity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dashboard_activity(integer) TO authenticated;
