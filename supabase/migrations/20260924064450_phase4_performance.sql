drop policy "Study room peers can view each other's profiles" on "public"."profiles";

drop policy "Users can view their own profile" on "public"."profiles";

drop policy "Group managers can insert members" on "public"."study_room_members";

drop policy "Group managers can update members" on "public"."study_room_members";

drop policy "Group owner can insert initial membership" on "public"."study_room_members";

drop policy "Room members can view members in the same room" on "public"."study_room_members";

drop policy "Users can update their own room membership" on "public"."study_room_members";

drop policy "Users can view their own group memberships" on "public"."study_room_members";

drop policy "Active group members can insert group messages" on "public"."study_room_messages";

drop policy "Active group members can view group messages" on "public"."study_room_messages";

drop policy "Room members can send study room messages" on "public"."study_room_messages";

drop policy "Room members can view study room messages" on "public"."study_room_messages";

drop policy "Users can insert own task risk predictions" on "public"."task_risk_predictions";

drop policy "Users can view own task risk predictions" on "public"."task_risk_predictions";

revoke delete on table "public"."ml_model_versions" from "anon";

revoke insert on table "public"."ml_model_versions" from "anon";

revoke references on table "public"."ml_model_versions" from "anon";

revoke select on table "public"."ml_model_versions" from "anon";

revoke trigger on table "public"."ml_model_versions" from "anon";

revoke truncate on table "public"."ml_model_versions" from "anon";

revoke update on table "public"."ml_model_versions" from "anon";

revoke delete on table "public"."ml_model_versions" from "authenticated";

revoke insert on table "public"."ml_model_versions" from "authenticated";

revoke references on table "public"."ml_model_versions" from "authenticated";

revoke select on table "public"."ml_model_versions" from "authenticated";

revoke trigger on table "public"."ml_model_versions" from "authenticated";

revoke truncate on table "public"."ml_model_versions" from "authenticated";

revoke update on table "public"."ml_model_versions" from "authenticated";

revoke delete on table "public"."task_risk_predictions" from "anon";

revoke insert on table "public"."task_risk_predictions" from "anon";

revoke references on table "public"."task_risk_predictions" from "anon";

revoke select on table "public"."task_risk_predictions" from "anon";

revoke trigger on table "public"."task_risk_predictions" from "anon";

revoke truncate on table "public"."task_risk_predictions" from "anon";

revoke update on table "public"."task_risk_predictions" from "anon";

revoke delete on table "public"."task_risk_predictions" from "authenticated";

revoke insert on table "public"."task_risk_predictions" from "authenticated";

revoke references on table "public"."task_risk_predictions" from "authenticated";

revoke select on table "public"."task_risk_predictions" from "authenticated";

revoke trigger on table "public"."task_risk_predictions" from "authenticated";

revoke truncate on table "public"."task_risk_predictions" from "authenticated";

revoke update on table "public"."task_risk_predictions" from "authenticated";

revoke delete on table "public"."task_risk_predictions" from "service_role";

revoke insert on table "public"."task_risk_predictions" from "service_role";

revoke references on table "public"."task_risk_predictions" from "service_role";

revoke select on table "public"."task_risk_predictions" from "service_role";

revoke trigger on table "public"."task_risk_predictions" from "service_role";

revoke truncate on table "public"."task_risk_predictions" from "service_role";

revoke update on table "public"."task_risk_predictions" from "service_role";

alter table "public"."task_risk_predictions" drop constraint "task_risk_predictions_goal_id_fkey";

alter table "public"."task_risk_predictions" drop constraint "task_risk_predictions_score_check";

alter table "public"."task_risk_predictions" drop constraint "task_risk_predictions_task_id_fkey";

alter table "public"."task_risk_predictions" drop constraint "task_risk_predictions_user_id_fkey";

drop function if exists "public"."expire_frozen_streaks"();

drop function if exists "public"."get_cms_setting"(p_key text);

drop function if exists "public"."get_global_weekly_leaderboard"(p_week_start date, p_week_end date, p_limit integer);

drop function if exists "public"."get_my_global_weekly_rank"(p_week_start date, p_week_end date);

drop function if exists "public"."get_my_latest_task_risk_predictions"(p_limit integer);

alter table "public"."task_risk_predictions" drop constraint "task_risk_predictions_pkey";

drop index if exists "public"."idx_ai_insight_cards_native_task_risk_assessment_id";

drop index if exists "public"."idx_ai_insight_cards_prediction_id";

drop index if exists "public"."idx_deadline_risk_prediction_explanations_prediction_id";

drop index if exists "public"."idx_document_chunks_document";

drop index if exists "public"."idx_document_chunks_embedding_ivfflat";

drop index if exists "public"."idx_goal_progress_snapshots_user_id";

drop index if exists "public"."idx_pbi_snapshots_user_id";

drop index if exists "public"."idx_pbi_weight_profiles_user_id";

drop index if exists "public"."idx_reward_ledger_event_type";

drop index if exists "public"."idx_reward_ledger_user_created";

drop index if exists "public"."idx_study_room_members_room_id";

drop index if exists "public"."idx_task_risk_predictions_level";

drop index if exists "public"."idx_task_risk_predictions_task_time";

drop index if exists "public"."idx_task_risk_predictions_user_time";

drop index if exists "public"."task_risk_predictions_pkey";

drop table "public"."task_risk_predictions";

alter table "public"."user_engagement_stats" add column "valid_completed_tasks_total" integer not null default 0;

alter table "public"."user_engagement_stats" add column "valid_focus_sessions_total" integer not null default 0;

drop type "public"."task_risk_level";

CREATE INDEX idx_cms_settings_updated_by ON public.cms_settings USING btree (updated_by) WHERE (updated_by IS NOT NULL);

CREATE INDEX idx_distraction_events_user_occurred ON public.distraction_events USING btree (user_id, occurred_at DESC);

CREATE INDEX idx_focus_sessions_user_status_ended ON public.focus_sessions USING btree (user_id, status, ended_at DESC) INCLUDE (actual_focus_minutes);

CREATE INDEX idx_focus_sessions_weekly_cover ON public.focus_sessions USING btree (started_at DESC, user_id) INCLUDE (actual_focus_minutes) WHERE ((ended_at IS NOT NULL) AND (actual_focus_minutes > 0));

CREATE INDEX idx_goals_source_roadmap_node ON public.goals USING btree (source_roadmap_node_id) WHERE (source_roadmap_node_id IS NOT NULL);

CREATE INDEX idx_learning_document_permissions_created_by ON public.learning_document_permissions USING btree (created_by);

CREATE INDEX idx_learning_roadmap_nodes_linked_goal ON public.learning_roadmap_nodes USING btree (linked_goal_id) WHERE (linked_goal_id IS NOT NULL);

CREATE INDEX idx_learning_roadmap_nodes_linked_task ON public.learning_roadmap_nodes USING btree (linked_task_id) WHERE (linked_task_id IS NOT NULL);

CREATE INDEX idx_rag_chat_sessions_goal ON public.rag_chat_sessions USING btree (goal_id) WHERE (goal_id IS NOT NULL);

CREATE INDEX idx_rag_chat_sessions_task ON public.rag_chat_sessions USING btree (task_id) WHERE (task_id IS NOT NULL);

CREATE INDEX idx_study_group_weekly_challenges_created_by ON public.study_group_weekly_challenges USING btree (created_by);

CREATE INDEX idx_study_room_members_user_active_room ON public.study_room_members USING btree (user_id, membership_status, room_id);

CREATE INDEX idx_study_rooms_archived_by ON public.study_rooms USING btree (archived_by) WHERE (archived_by IS NOT NULL);

CREATE INDEX idx_tasks_completed_at_user ON public.tasks USING btree (completed_at DESC, user_id) WHERE ((status = 'completed'::public.task_status) AND (completed_at IS NOT NULL));

CREATE INDEX idx_tasks_source_roadmap_node ON public.tasks USING btree (source_roadmap_node_id) WHERE (source_roadmap_node_id IS NOT NULL);

CREATE INDEX idx_tasks_user_goal_status ON public.tasks USING btree (user_id, goal_id, status) WHERE (goal_id IS NOT NULL);

CREATE INDEX idx_tasks_user_parent_due_created ON public.tasks USING btree (user_id, parent_task_id, due_at, created_at) WHERE (parent_task_id IS NOT NULL);

CREATE INDEX idx_tasks_user_root_due_created ON public.tasks USING btree (user_id, due_at, created_at DESC) WHERE (parent_task_id IS NULL);

CREATE INDEX idx_tasks_user_status_completed ON public.tasks USING btree (user_id, status, completed_at DESC);

alter table "public"."user_engagement_stats" add constraint "user_engagement_stats_valid_completed_tasks_total_check" CHECK ((valid_completed_tasks_total >= 0)) not valid;

alter table "public"."user_engagement_stats" validate constraint "user_engagement_stats_valid_completed_tasks_total_check";

alter table "public"."user_engagement_stats" add constraint "user_engagement_stats_valid_focus_sessions_total_check" CHECK ((valid_focus_sessions_total >= 0)) not valid;

alter table "public"."user_engagement_stats" validate constraint "user_engagement_stats_valid_focus_sessions_total_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.broadcast_user_engagement_stats_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'user_id',NEW.user_id,
      'current_streak_days',NEW.current_streak_days,
      'streak_status',NEW.streak_status,
      'token_balance',NEW.token_balance
    ),
    'stats_changed',
    'engagement-stats:' || NEW.user_id::text,
    true
  );

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_engagement_realtime_topic(p_topic text, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    p_user_id IS NOT NULL
    AND p_topic = 'engagement-stats:' || p_user_id::text;
$function$
;

CREATE OR REPLACE FUNCTION public.evaluate_engagement_streak_states()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_frozen_count integer := 0;
  v_lost_count integer := 0;
  v_reward_window_updates integer := 0;
BEGIN
  -- Keep the rolling 7-day reward metric correct without rebuilding
  -- a user's complete activity history.
  WITH reward_7d AS (
    SELECT
      stats.user_id,
      COALESCE(
        SUM(reward.token_delta) FILTER (
          WHERE reward.token_delta > 0
            AND reward.occurred_at >= now() - interval '7 days'
        ),
        0
      )::integer AS tokens_earned_last_7d
    FROM public.user_engagement_stats stats
    LEFT JOIN public.reward_ledger reward
      ON reward.user_id = stats.user_id
     AND reward.occurred_at >= now() - interval '7 days'
    GROUP BY stats.user_id
  ),
  updated AS (
    UPDATE public.user_engagement_stats stats
    SET tokens_earned_last_7d = reward_7d.tokens_earned_last_7d
    FROM reward_7d
    WHERE stats.user_id = reward_7d.user_id
      AND stats.tokens_earned_last_7d IS DISTINCT FROM reward_7d.tokens_earned_last_7d
    RETURNING stats.user_id
  )
  SELECT count(*) INTO v_reward_window_updates FROM updated;

  -- A restore counts as a temporary continuity marker for status decay, but it
  -- does not increment streak length. This prevents a restored streak from
  -- being frozen again immediately by the evaluator.
  WITH effective_activity AS MATERIALIZED (
    SELECT
      stats.user_id,
      GREATEST(
        stats.last_valid_activity_date,
        (
          SELECT max(event.event_date)
          FROM public.user_streak_events event
          WHERE event.user_id = stats.user_id
            AND event.event_type = 'streak_restored'
        )
      ) AS effective_date
    FROM public.user_engagement_stats stats
    WHERE stats.streak_status = 'active'
  ),
  frozen AS (
    UPDATE public.user_engagement_stats stats
    SET
      streak_status = 'frozen',
      streak_freeze_started_at = now(),
      streak_restore_deadline_at = now() + interval '24 hours',
      last_streak_evaluation_at = now()
    FROM effective_activity activity
    WHERE stats.user_id = activity.user_id
      AND stats.streak_status = 'active'
      AND activity.effective_date = current_date - 2
    RETURNING
      stats.user_id,
      stats.last_valid_activity_date,
      stats.current_streak_days,
      stats.streak_restore_deadline_at
  ),
  inserted_events AS (
    INSERT INTO public.user_streak_events (
      user_id,
      event_type,
      previous_status,
      next_status,
      event_date,
      token_delta,
      source_key,
      metadata,
      occurred_at
    )
    SELECT
      frozen.user_id,
      'streak_frozen',
      'active',
      'frozen',
      current_date,
      0,
      'streak_frozen:' || current_date::text,
      jsonb_build_object(
        'reason', 'missed_two_days',
        'last_valid_activity_date', frozen.last_valid_activity_date,
        'current_streak_days', frozen.current_streak_days,
        'restore_deadline_at', frozen.streak_restore_deadline_at
      ),
      now()
    FROM frozen
    ON CONFLICT (user_id, source_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_frozen_count FROM frozen;

  -- Expire frozen streaks and also repair stale "active" rows that missed the
  -- old page-read recalculation path for more than two days.
  WITH effective_activity AS MATERIALIZED (
    SELECT
      stats.user_id,
      stats.streak_status,
      stats.last_valid_activity_date,
      stats.streak_restore_deadline_at,
      GREATEST(
        stats.last_valid_activity_date,
        (
          SELECT max(event.event_date)
          FROM public.user_streak_events event
          WHERE event.user_id = stats.user_id
            AND event.event_type = 'streak_restored'
        )
      ) AS effective_date
    FROM public.user_engagement_stats stats
    WHERE stats.streak_status IN ('active', 'frozen')
  ),
  lost AS (
    UPDATE public.user_engagement_stats stats
    SET
      streak_status = 'lost',
      current_streak_days = 0,
      streak_freeze_started_at = NULL,
      streak_restore_deadline_at = NULL,
      last_streak_evaluation_at = now()
    FROM effective_activity activity
    WHERE stats.user_id = activity.user_id
      AND (
        (
          stats.streak_status = 'frozen'
          AND stats.streak_restore_deadline_at IS NOT NULL
          AND stats.streak_restore_deadline_at <= now()
        )
        OR
        (
          stats.streak_status = 'active'
          AND (
            activity.effective_date IS NULL
            OR activity.effective_date < current_date - 2
          )
        )
      )
    RETURNING
      stats.user_id,
      activity.streak_status AS previous_status,
      stats.last_valid_activity_date
  ),
  inserted_events AS (
    INSERT INTO public.user_streak_events (
      user_id,
      event_type,
      previous_status,
      next_status,
      event_date,
      token_delta,
      source_key,
      metadata,
      occurred_at
    )
    SELECT
      lost.user_id,
      'streak_lost',
      lost.previous_status,
      'lost',
      current_date,
      0,
      'streak_lost:' || current_date::text || ':' || lost.user_id::text,
      jsonb_build_object(
        'reason',
        CASE
          WHEN lost.previous_status = 'frozen' THEN 'restore_window_expired'
          ELSE 'stale_active_state_repaired'
        END,
        'last_valid_activity_date', lost.last_valid_activity_date
      ),
      now()
    FROM lost
    ON CONFLICT (user_id, source_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_lost_count FROM lost;

  RETURN jsonb_build_object(
    'frozen', v_frozen_count,
    'lost', v_lost_count,
    'reward_window_updates', v_reward_window_updates
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_user_id_by_auth_email_for_group(p_group_id uuid, p_email text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT auth_user.id
  FROM auth.users auth_user
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND public.can_manage_study_group_members(
      p_group_id,
      (SELECT auth.uid())
    )
    AND lower(auth_user.email) = lower(trim(p_email))
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cms_settings(p_keys text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    jsonb_object_agg(setting.key, setting.value),
    '{}'::jsonb
  )
  FROM public.cms_settings setting
  WHERE setting.key = ANY(p_keys)
    AND setting.key = ANY(
      ARRAY[
        'global_leaderboard_enabled',
        'group_leaderboard_enabled',
        'default_rag_top_k',
        'default_rag_prompt_variant',
        'weekly_challenge_default_focus_minutes',
        'weekly_challenge_default_completed_tasks'
      ]::text[]
    );
$function$
;

CREATE OR REPLACE FUNCTION public.get_engagement_reward_aggregates(p_user_id uuid)
 RETURNS TABLE(token_balance integer, total_tokens_earned integer, total_tokens_spent integer, tokens_earned_last_7d integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    COALESCE(SUM(reward.token_delta), 0)::integer AS token_balance,
    COALESCE(SUM(reward.token_delta) FILTER (
      WHERE reward.token_delta > 0
    ), 0)::integer AS total_tokens_earned,
    ABS(COALESCE(SUM(reward.token_delta) FILTER (
      WHERE reward.token_delta < 0
    ), 0))::integer AS total_tokens_spent,
    COALESCE(SUM(reward.token_delta) FILTER (
      WHERE reward.token_delta > 0
        AND reward.occurred_at >= now() - interval '7 days'
    ), 0)::integer AS tokens_earned_last_7d
  FROM public.reward_ledger reward
  WHERE reward.user_id = p_user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_engagement_stats_payload(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'current_streak_days',s.current_streak_days,
    'longest_streak_days',s.longest_streak_days,
    'latest_active_study_date',s.latest_active_study_date,
    'last_valid_activity_date',s.last_valid_activity_date,
    'streak_status',s.streak_status,
    'streak_freeze_started_at',s.streak_freeze_started_at,
    'streak_restore_deadline_at',s.streak_restore_deadline_at,
    'can_restore_streak',(
      s.streak_status='frozen'
      AND s.streak_restore_deadline_at IS NOT NULL
      AND s.streak_restore_deadline_at > now()
    ),
    'restore_cost_tokens',30,
    'token_balance',s.token_balance,
    'total_tokens_earned',s.total_tokens_earned,
    'total_tokens_spent',s.total_tokens_spent,
    'tokens_earned_last_7d',s.tokens_earned_last_7d,
    'completed_focus_sessions_total',s.completed_focus_sessions_total,
    'valid_focus_sessions_total',s.valid_focus_sessions_total,
    'completed_tasks_total',s.completed_tasks_total,
    'valid_completed_tasks_total',s.valid_completed_tasks_total
  )
  FROM public.user_engagement_stats s
  WHERE s.user_id=p_user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_weekly_leaderboard_bundle(p_week_start date, p_week_end date, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH eligible_users AS (
  SELECT
    profile.id AS user_id,
    coalesce(
      nullif(trim(profile.display_name),''),
      nullif(trim(profile.full_name),''),
      'User ' || left(profile.id::text,8)
    ) AS display_name,
    nullif(trim(profile.avatar_url),'') AS avatar_url
  FROM public.profiles profile
  WHERE profile.leaderboard_opt_in=true
),
focus_summary AS (
  SELECT
    focus.user_id,
    coalesce(sum(focus.actual_focus_minutes),0)::integer AS focus_minutes,
    count(*)::integer AS focus_sessions
  FROM public.focus_sessions focus
  WHERE focus.ended_at IS NOT NULL
    AND focus.started_at >= p_week_start::timestamptz
    AND focus.started_at < (p_week_end + 1)::timestamptz
    AND focus.actual_focus_minutes > 0
  GROUP BY focus.user_id
),
task_summary AS (
  SELECT
    task.user_id,
    count(*)::integer AS completed_tasks
  FROM public.tasks task
  WHERE task.status='completed'
    AND task.completed_at >= p_week_start::timestamptz
    AND task.completed_at < (p_week_end + 1)::timestamptz
  GROUP BY task.user_id
),
scored AS (
  SELECT
    user_row.user_id,
    user_row.display_name,
    user_row.avatar_url,
    coalesce(focus_summary.focus_minutes,0)::integer AS focus_minutes,
    coalesce(task_summary.completed_tasks,0)::integer AS completed_tasks,
    coalesce(focus_summary.focus_sessions,0)::integer AS focus_sessions,
    coalesce(stats.current_streak_days,0)::integer AS current_streak,
    (
      coalesce(focus_summary.focus_minutes,0)
      + coalesce(task_summary.completed_tasks,0) * 10
      + coalesce(focus_summary.focus_sessions,0) * 5
    )::integer AS score
  FROM eligible_users user_row
  LEFT JOIN focus_summary
    ON focus_summary.user_id=user_row.user_id
  LEFT JOIN task_summary
    ON task_summary.user_id=user_row.user_id
  LEFT JOIN public.user_engagement_stats stats
    ON stats.user_id=user_row.user_id
),
ranked_all AS (
  SELECT
    scored.*,
    dense_rank() OVER (
      ORDER BY
        scored.score DESC,
        scored.focus_minutes DESC,
        scored.completed_tasks DESC,
        scored.focus_sessions DESC
    )::integer AS rank_position
  FROM scored
),
top_rows AS (
  SELECT *
  FROM ranked_all
  WHERE score>0
  ORDER BY rank_position ASC,display_name ASC
  LIMIT greatest(1,least(p_limit,100))
)
SELECT jsonb_build_object(
  'rows',
  coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id',top_rows.user_id,
          'display_name',top_rows.display_name,
          'avatar_url',top_rows.avatar_url,
          'focus_minutes',top_rows.focus_minutes,
          'completed_tasks',top_rows.completed_tasks,
          'focus_sessions',top_rows.focus_sessions,
          'current_streak',top_rows.current_streak,
          'score',top_rows.score,
          'rank_position',top_rows.rank_position
        )
        ORDER BY top_rows.rank_position,top_rows.display_name
      )
      FROM top_rows
    ),
    '[]'::jsonb
  ),
  'myRank',
  (
    SELECT jsonb_build_object(
      'user_id',mine.user_id,
      'display_name',mine.display_name,
      'focus_minutes',mine.focus_minutes,
      'completed_tasks',mine.completed_tasks,
      'focus_sessions',mine.focus_sessions,
      'current_streak',mine.current_streak,
      'score',mine.score,
      'rank_position',mine.rank_position
    )
    FROM ranked_all mine
    WHERE mine.user_id=(SELECT auth.uid())
    LIMIT 1
  )
);
$function$
;

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
  SELECT
    p.user_id,
    p.days,
    (CURRENT_DATE - (p.days - 1))::date AS first_date
  FROM params p
),
dates AS (
  SELECT generate_series(
    b.first_date,
    CURRENT_DATE,
    interval '1 day'
  )::date AS day
  FROM date_bounds b
),
task_stats AS (
  SELECT
    COUNT(*) FILTER (
      WHERE t.status = 'completed'
        AND t.completed_at >= b.first_date::timestamptz
    )::int AS completed_tasks,
    COUNT(*) FILTER (WHERE t.status = 'todo')::int AS todo_count,
    COUNT(*) FILTER (WHERE t.status = 'in_progress')::int AS in_progress_count,
    COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_count,
    COUNT(*) FILTER (WHERE t.status = 'overdue')::int AS overdue_count,
    COUNT(*) FILTER (WHERE t.status = 'cancelled')::int AS cancelled_count
  FROM date_bounds b
  LEFT JOIN public.tasks t
    ON t.user_id = b.user_id
),
focus_by_day AS (
  SELECT
    f.ended_at::date AS day,
    COUNT(*)::int AS completed_sessions,
    COALESCE(SUM(f.actual_focus_minutes), 0)::int AS focus_minutes
  FROM date_bounds b
  JOIN public.focus_sessions f
    ON f.user_id = b.user_id
   AND f.status = 'completed'
   AND f.ended_at >= b.first_date::timestamptz
  GROUP BY f.ended_at::date
),
focus_totals AS (
  SELECT
    COALESCE(SUM(completed_sessions), 0)::int AS completed_sessions,
    COALESCE(SUM(focus_minutes), 0)::int AS total_focus_minutes
  FROM focus_by_day
),
distraction_by_day AS (
  SELECT
    d.occurred_at::date AS day,
    COUNT(*)::int AS distractions
  FROM date_bounds b
  JOIN public.distraction_events d
    ON d.user_id = b.user_id
   AND d.occurred_at >= b.first_date::timestamptz
  GROUP BY d.occurred_at::date
),
distraction_totals AS (
  SELECT COALESCE(SUM(distractions), 0)::int AS distraction_events
  FROM distraction_by_day
),
trend AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'dateKey', to_char(dt.day, 'YYYY-MM-DD'),
      'focusMinutes', COALESCE(f.focus_minutes, 0),
      'distractions', COALESCE(d.distractions, 0)
    )
    ORDER BY dt.day
  ) AS items
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
    jsonb_build_object('status', 'Completed', 'count', ts.completed_count),
    jsonb_build_object('status', 'Overdue', 'count', ts.overdue_count),
    jsonb_build_object('status', 'Cancelled', 'count', ts.cancelled_count)
  )
)
FROM task_stats ts
CROSS JOIN focus_totals ft
CROSS JOIN distraction_totals dst
CROSS JOIN trend tr;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_goals_with_progress()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH goal_rows AS (
  SELECT
    goal.id,
    goal.user_id,
    goal.title,
    goal.description,
    goal.goal_type,
    goal.status,
    goal.start_date,
    goal.target_date,
    goal.progress_percent,
    goal.created_at,
    goal.updated_at,
    goal.source_roadmap_id,
    goal.source_roadmap_node_id,
    COUNT(task.id)::integer AS total_tasks,
    COUNT(task.id) FILTER (WHERE task.status = 'completed')::integer AS completed_tasks
  FROM public.goals goal
  LEFT JOIN public.tasks task
    ON task.goal_id = goal.id
   AND task.user_id = goal.user_id
  WHERE goal.user_id = (SELECT auth.uid())
  GROUP BY goal.id
)
SELECT COALESCE(
  jsonb_agg(
    to_jsonb(goal_rows)
    || jsonb_build_object(
      'computed_progress',
      CASE
        WHEN goal_rows.total_tasks = 0 THEN 0
        ELSE ROUND(
          goal_rows.completed_tasks::numeric
          / goal_rows.total_tasks::numeric
          * 100,
          2
        )
      END
    )
    ORDER BY goal_rows.created_at DESC
  ),
  '[]'::jsonb
)
FROM goal_rows;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_tasks_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 8, p_search text DEFAULT NULL::text, p_status public.task_status DEFAULT NULL::public.task_status, p_priority public.task_priority DEFAULT NULL::public.task_priority, p_goal_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH params AS (
  SELECT
    GREATEST(1, COALESCE(p_page, 1)) AS page,
    GREATEST(1, LEAST(COALESCE(p_page_size, 8), 100)) AS page_size,
    NULLIF(BTRIM(p_search), '') AS search_text,
    (SELECT auth.uid()) AS user_id
),
filtered_roots AS MATERIALIZED (
  SELECT task.*
  FROM public.tasks task
  CROSS JOIN params
  WHERE task.user_id = params.user_id
    AND task.parent_task_id IS NULL
    AND (
      params.search_text IS NULL
      OR task.title ILIKE '%' || params.search_text || '%'
      OR COALESCE(task.description, '') ILIKE '%' || params.search_text || '%'
    )
    AND (p_status IS NULL OR task.status = p_status)
    AND (p_priority IS NULL OR task.priority = p_priority)
    AND (p_goal_id IS NULL OR task.goal_id = p_goal_id)
),
page_roots AS MATERIALIZED (
  SELECT root.*
  FROM filtered_roots root
  ORDER BY root.due_at ASC NULLS LAST, root.created_at DESC
  OFFSET (SELECT (page - 1) * page_size FROM params)
  LIMIT (SELECT page_size FROM params)
),
root_json AS (
  SELECT
    root.id,
    to_jsonb(root)
    || jsonb_build_object(
      'goals',
      CASE
        WHEN goal.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', goal.id,
          'title', goal.title,
          'goal_type', goal.goal_type,
          'status', goal.status
        )
      END,
      'subtasks',
      COALESCE(
        (
          SELECT jsonb_agg(
            to_jsonb(subtask)
            || jsonb_build_object(
              'goals',
              CASE
                WHEN sub_goal.id IS NULL THEN NULL
                ELSE jsonb_build_object(
                  'id', sub_goal.id,
                  'title', sub_goal.title,
                  'goal_type', sub_goal.goal_type,
                  'status', sub_goal.status
                )
              END
            )
            ORDER BY subtask.due_at ASC NULLS LAST, subtask.created_at ASC
          )
          FROM public.tasks subtask
          LEFT JOIN public.goals sub_goal
            ON sub_goal.id = subtask.goal_id
          WHERE subtask.parent_task_id = root.id
            AND subtask.user_id = (SELECT user_id FROM params)
        ),
        '[]'::jsonb
      )
    ) AS payload
  FROM page_roots root
  LEFT JOIN public.goals goal
    ON goal.id = root.goal_id
)
SELECT jsonb_build_object(
  'tasks',
  COALESCE(
    (
      SELECT jsonb_agg(
        root_json.payload
        ORDER BY page_root.due_at ASC NULLS LAST, page_root.created_at DESC
      )
      FROM root_json
      JOIN page_roots page_root ON page_root.id = root_json.id
    ),
    '[]'::jsonb
  ),
  'totalCount', (SELECT COUNT(*)::integer FROM filtered_roots),
  'page', (SELECT page FROM params),
  'pageSize', (SELECT page_size FROM params),
  'totalPages',
    GREATEST(
      1,
      CEIL(
        (SELECT COUNT(*)::numeric FROM filtered_roots)
        / (SELECT page_size::numeric FROM params)
      )::integer
    )
);
$function$
;

CREATE OR REPLACE FUNCTION public.process_engagement_activity_atomic(p_user_id uuid, p_activity_type text, p_activity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_stats public.user_engagement_stats%rowtype;
  v_activity_date date;
  v_activity_ts timestamptz;
  v_valid boolean := false;
  v_source_key text;
  v_source_event public.reward_event_type;
  v_source_delta integer;
  v_source_payload jsonb;
  v_source_note text;
  v_previous_date date;
  v_previous_streak integer;
  v_current_streak integer;
  v_longest_streak integer;
  v_continued boolean := false;
  v_source_inserted boolean := false;
  v_reward_delta integer := 0;
  v_earned_delta integer := 0;
  v_new_status public.engagement_streak_status;
  v_freeze_started timestamptz;
  v_restore_deadline timestamptz;
  v_today date := (now() at time zone 'utc')::date;
  v_yesterday date := ((now() at time zone 'utc')::date - 1);
  v_created_rewards jsonb := '[]'::jsonb;
  v_reward_inserted boolean;
  v_prev_status public.engagement_streak_status;
  v_new_focus_total integer;
  v_new_valid_focus_total integer;
  v_new_task_total integer;
  v_new_valid_task_total integer;
BEGIN
  IF p_user_id IS NULL OR p_activity_id IS NULL THEN
    RETURN jsonb_build_object('status','requires_reconcile','reason','invalid_arguments');
  END IF;

  IF p_activity_type NOT IN ('focus_session','task') THEN
    RETURN jsonb_build_object('status','requires_reconcile','reason','unsupported_activity_type');
  END IF;

  SELECT *
  INTO v_stats
  FROM public.user_engagement_stats
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','requires_reconcile','reason','missing_engagement_stats');
  END IF;

  v_prev_status := v_stats.streak_status;

  IF p_activity_type = 'focus_session' THEN
    SELECT
      ended_at,
      (
        status = 'completed'
        AND ended_at IS NOT NULL
        AND coalesce(actual_focus_minutes,0) >= 10
      ),
      jsonb_build_object(
        'focus_session_id', id,
        'actual_focus_minutes', actual_focus_minutes,
        'anti_abuse_minimum_minutes', 10
      )
    INTO v_activity_ts, v_valid, v_source_payload
    FROM public.focus_sessions
    WHERE id=p_activity_id AND user_id=p_user_id;

    IF NOT FOUND OR NOT v_valid THEN
      RETURN jsonb_build_object('status','requires_reconcile','reason','invalid_or_missing_activity');
    END IF;

    v_source_key := 'focus_session_completed:' || p_activity_id::text;
    v_source_event := 'focus_session_completed';
    v_source_delta := 5;
    v_source_note := 'Completed a valid focus session.';
  ELSE
    SELECT
      completed_at,
      (
        status = 'completed'
        AND completed_at IS NOT NULL
        AND (
          coalesce(estimated_minutes,0) >= 10
          OR (
            created_at IS NOT NULL
            AND extract(epoch FROM (completed_at-created_at))/60 >= 5
          )
        )
      ),
      jsonb_build_object(
        'task_id', id,
        'estimated_minutes', estimated_minutes,
        'anti_abuse_minimum_task_age_minutes', 5,
        'anti_abuse_minimum_estimated_minutes', 10
      )
    INTO v_activity_ts, v_valid, v_source_payload
    FROM public.tasks
    WHERE id=p_activity_id AND user_id=p_user_id;

    IF NOT FOUND OR NOT v_valid THEN
      RETURN jsonb_build_object('status','requires_reconcile','reason','invalid_or_missing_activity');
    END IF;

    v_source_key := 'task_completed:' || p_activity_id::text;
    v_source_event := 'task_completed';
    v_source_delta := 10;
    v_source_note := 'Completed a valid task.';
  END IF;

  v_activity_date := (v_activity_ts AT TIME ZONE 'utc')::date;
  v_previous_date := v_stats.last_valid_activity_date;
  v_previous_streak := coalesce(v_stats.current_streak_days,0);

  IF v_previous_date IS NOT NULL AND v_activity_date < v_previous_date THEN
    RETURN jsonb_build_object('status','requires_reconcile','reason','out_of_order_activity');
  END IF;

  INSERT INTO public.reward_ledger(
    user_id,event_type,token_delta,source_key,source_payload,reward_note,occurred_at
  )
  VALUES(
    p_user_id,v_source_event,v_source_delta,v_source_key,v_source_payload,v_source_note,v_activity_ts
  )
  ON CONFLICT (user_id,source_key) DO NOTHING
  RETURNING true INTO v_reward_inserted;

  v_source_inserted := coalesce(v_reward_inserted,false);

  IF NOT v_source_inserted THEN
    RETURN jsonb_build_object(
      'status','applied',
      'source_was_new',false,
      'newly_created_rewards','[]'::jsonb,
      'stats',public.get_engagement_stats_payload(p_user_id)
    );
  END IF;

  IF v_source_inserted THEN
    v_reward_delta := v_reward_delta + v_source_delta;
    v_earned_delta := v_earned_delta + greatest(v_source_delta,0);
    v_created_rewards := v_created_rewards || jsonb_build_array(
      jsonb_build_object(
        'event_type',v_source_event::text,
        'token_delta',v_source_delta,
        'source_key',v_source_key,
        'reward_note',v_source_note
      )
    );
  END IF;

  IF v_previous_date IS NULL THEN
    v_current_streak := 1;
  ELSIF v_activity_date = v_previous_date THEN
    v_current_streak := greatest(v_previous_streak,1);
  ELSIF v_activity_date = v_previous_date + 1 THEN
    v_current_streak := greatest(v_previous_streak,0) + 1;
    v_continued := true;
  ELSE
    v_current_streak := 1;
  END IF;

  IF v_continued THEN
    v_reward_inserted := false;
    INSERT INTO public.reward_ledger(
      user_id,event_type,token_delta,source_key,source_payload,reward_note,occurred_at
    )
    VALUES(
      p_user_id,
      'daily_streak_continued',
      8,
      'daily_streak_continued:' || v_activity_date::text,
      jsonb_build_object('study_date',v_activity_date::text),
      'Continued the study streak into a new day.',
      v_activity_date::timestamptz
    )
    ON CONFLICT (user_id,source_key) DO NOTHING
    RETURNING true INTO v_reward_inserted;

    IF coalesce(v_reward_inserted,false) THEN
      v_reward_delta := v_reward_delta + 8;
      v_earned_delta := v_earned_delta + 8;
      v_created_rewards := v_created_rewards || jsonb_build_array(
        jsonb_build_object(
          'event_type','daily_streak_continued',
          'token_delta',8,
          'source_key','daily_streak_continued:' || v_activity_date::text,
          'reward_note','Continued the study streak into a new day.'
        )
      );
    END IF;

    IF v_current_streak IN (3,7) THEN
      v_reward_inserted := false;
      INSERT INTO public.reward_ledger(
        user_id,event_type,token_delta,source_key,source_payload,reward_note,occurred_at
      )
      VALUES(
        p_user_id,
        CASE WHEN v_current_streak=3
          THEN 'streak_milestone_3'::public.reward_event_type
          ELSE 'streak_milestone_7'::public.reward_event_type
        END,
        CASE WHEN v_current_streak=3 THEN 15 ELSE 30 END,
        CASE WHEN v_current_streak=3
          THEN 'streak_milestone_3:' || v_activity_date::text
          ELSE 'streak_milestone_7:' || v_activity_date::text
        END,
        jsonb_build_object(
          'milestone_days',v_current_streak,
          'study_date',v_activity_date::text
        ),
        CASE WHEN v_current_streak=3
          THEN 'Reached a 3-day study streak.'
          ELSE 'Reached a 7-day study streak.'
        END,
        v_activity_date::timestamptz
      )
      ON CONFLICT (user_id,source_key) DO NOTHING
      RETURNING true INTO v_reward_inserted;

      IF coalesce(v_reward_inserted,false) THEN
        v_reward_delta := v_reward_delta + CASE WHEN v_current_streak=3 THEN 15 ELSE 30 END;
        v_earned_delta := v_earned_delta + CASE WHEN v_current_streak=3 THEN 15 ELSE 30 END;
        v_created_rewards := v_created_rewards || jsonb_build_array(
          jsonb_build_object(
            'event_type',CASE WHEN v_current_streak=3 THEN 'streak_milestone_3' ELSE 'streak_milestone_7' END,
            'token_delta',CASE WHEN v_current_streak=3 THEN 15 ELSE 30 END,
            'source_key',CASE WHEN v_current_streak=3
              THEN 'streak_milestone_3:' || v_activity_date::text
              ELSE 'streak_milestone_7:' || v_activity_date::text
            END,
            'reward_note',CASE WHEN v_current_streak=3
              THEN 'Reached a 3-day study streak.'
              ELSE 'Reached a 7-day study streak.'
            END
          )
        );
      END IF;
    END IF;
  END IF;

  v_longest_streak := greatest(coalesce(v_stats.longest_streak_days,0),v_current_streak);

  IF v_activity_date IN (v_today,v_yesterday) THEN
    v_new_status := 'active';
    v_freeze_started := NULL;
    v_restore_deadline := NULL;
  ELSIF v_today - v_activity_date = 2 THEN
    IF v_stats.streak_status='frozen'
       AND v_stats.streak_restore_deadline_at IS NOT NULL
       AND v_stats.streak_restore_deadline_at > now() THEN
      v_new_status := 'frozen';
      v_freeze_started := v_stats.streak_freeze_started_at;
      v_restore_deadline := v_stats.streak_restore_deadline_at;
    ELSE
      v_new_status := 'frozen';
      v_freeze_started := now();
      v_restore_deadline := now() + interval '24 hours';
    END IF;
  ELSE
    v_new_status := 'lost';
    v_current_streak := 0;
    v_freeze_started := NULL;
    v_restore_deadline := NULL;
  END IF;

  v_new_focus_total := coalesce(v_stats.completed_focus_sessions_total,0);
  v_new_valid_focus_total := coalesce(v_stats.valid_focus_sessions_total,0);
  v_new_task_total := coalesce(v_stats.completed_tasks_total,0);
  v_new_valid_task_total := coalesce(v_stats.valid_completed_tasks_total,0);

  IF v_source_inserted AND p_activity_type='focus_session' THEN
    v_new_focus_total := v_new_focus_total + 1;
    v_new_valid_focus_total := v_new_valid_focus_total + 1;
  ELSIF v_source_inserted AND p_activity_type='task' THEN
    v_new_task_total := v_new_task_total + 1;
    v_new_valid_task_total := v_new_valid_task_total + 1;
  END IF;

  UPDATE public.user_engagement_stats
  SET
    current_streak_days = v_current_streak,
    longest_streak_days = v_longest_streak,
    latest_active_study_date = CASE
      WHEN latest_active_study_date IS NULL THEN v_activity_date
      ELSE greatest(latest_active_study_date,v_activity_date)
    END,
    last_valid_activity_date = CASE
      WHEN last_valid_activity_date IS NULL THEN v_activity_date
      ELSE greatest(last_valid_activity_date,v_activity_date)
    END,
    streak_status = v_new_status,
    streak_freeze_started_at = v_freeze_started,
    streak_restore_deadline_at = v_restore_deadline,
    last_streak_evaluation_at = now(),
    token_balance = token_balance + v_reward_delta,
    total_tokens_earned = total_tokens_earned + v_earned_delta,
    tokens_earned_last_7d = tokens_earned_last_7d + v_earned_delta,
    completed_focus_sessions_total = v_new_focus_total,
    valid_focus_sessions_total = v_new_valid_focus_total,
    completed_tasks_total = v_new_task_total,
    valid_completed_tasks_total = v_new_valid_task_total,
    calculation_version = 'engagement-v3-atomic',
    updated_at = now()
  WHERE user_id=p_user_id
  RETURNING * INTO v_stats;

  INSERT INTO public.user_streak_events(
    user_id,event_type,previous_status,next_status,event_date,
    token_delta,source_key,metadata,occurred_at
  )
  VALUES(
    p_user_id,
    'activity_detected',
    v_prev_status,
    v_new_status,
    v_activity_date,
    0,
    'activity_detected:' || v_activity_date::text,
    jsonb_build_object(
      'last_valid_activity_date',v_activity_date::text,
      'current_streak_days',v_current_streak
    ),
    now()
  )
  ON CONFLICT (user_id,source_key) DO NOTHING;

  IF v_prev_status IS DISTINCT FROM v_new_status THEN
    INSERT INTO public.user_streak_events(
      user_id,event_type,previous_status,next_status,event_date,
      token_delta,source_key,metadata,occurred_at
    )
    VALUES(
      p_user_id,
      CASE
        WHEN v_new_status='active' AND v_current_streak<=1 THEN 'streak_started'::public.streak_event_type
        WHEN v_new_status='active' THEN 'streak_continued'::public.streak_event_type
        WHEN v_new_status='frozen' THEN 'streak_frozen'::public.streak_event_type
        ELSE 'streak_lost'::public.streak_event_type
      END,
      v_prev_status,
      v_new_status,
      v_today,
      0,
      (
        CASE
          WHEN v_new_status='active' AND v_current_streak<=1 THEN 'streak_started'
          WHEN v_new_status='active' THEN 'streak_continued'
          WHEN v_new_status='frozen' THEN 'streak_frozen'
          ELSE 'streak_lost'
        END
      ) || ':' || v_today::text,
      jsonb_build_object(
        'current_streak_days',v_current_streak,
        'restore_deadline_at',v_restore_deadline
      ),
      now()
    )
    ON CONFLICT (user_id,source_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'status','applied',
    'source_was_new',v_source_inserted,
    'newly_created_rewards',v_created_rewards,
    'stats',jsonb_build_object(
      'current_streak_days',v_stats.current_streak_days,
      'longest_streak_days',v_stats.longest_streak_days,
      'latest_active_study_date',v_stats.latest_active_study_date,
      'last_valid_activity_date',v_stats.last_valid_activity_date,
      'streak_status',v_stats.streak_status,
      'streak_freeze_started_at',v_stats.streak_freeze_started_at,
      'streak_restore_deadline_at',v_stats.streak_restore_deadline_at,
      'can_restore_streak',(
        v_stats.streak_status='frozen'
        AND v_stats.streak_restore_deadline_at IS NOT NULL
        AND v_stats.streak_restore_deadline_at > now()
      ),
      'restore_cost_tokens',30,
      'token_balance',v_stats.token_balance,
      'total_tokens_earned',v_stats.total_tokens_earned,
      'total_tokens_spent',v_stats.total_tokens_spent,
      'tokens_earned_last_7d',v_stats.tokens_earned_last_7d,
      'completed_focus_sessions_total',v_stats.completed_focus_sessions_total,
      'valid_focus_sessions_total',v_stats.valid_focus_sessions_total,
      'completed_tasks_total',v_stats.completed_tasks_total,
      'valid_completed_tasks_total',v_stats.valid_completed_tasks_total
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_learning_roadmap(p_roadmap_id uuid)
 RETURNS TABLE(roadmap_id uuid, created_goals integer, created_tasks integer, created_subtasks integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_roadmap record;
  v_node record;

  v_goal_id uuid;
  v_task_id uuid;
  v_parent_goal_id uuid;
  v_parent_task_id uuid;

  v_goal_map jsonb := '{}'::jsonb;
  v_task_map jsonb := '{}'::jsonb;

  v_created_goals integer := 0;
  v_created_tasks integer := 0;
  v_created_subtasks integer := 0;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_roadmap
  from public.learning_roadmaps roadmap
  where roadmap.id = p_roadmap_id
    and roadmap.user_id = v_user_id
  for update;

  if v_roadmap.id is null then
    raise exception 'Roadmap not found.';
  end if;

  if v_roadmap.status::text <> 'draft' then
    raise exception 'Only draft roadmaps can be applied.';
  end if;

  if not exists (
    select 1
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'goal'
  ) then
    raise exception 'Roadmap must contain at least one goal node.';
  end if;

  -- ==========================================================
  -- Step 1: Create goals
  -- ==========================================================

  for v_node in
    select *
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'goal'
    order by node.sort_order asc, node.position_x asc
  loop
    insert into public.goals (
      user_id,
      title,
      description,
      target_date,
      source_roadmap_id,
      source_roadmap_node_id
    )
    values (
      v_user_id,
      v_node.title,
      v_node.description,
      coalesce(v_node.suggested_end_date, v_roadmap.end_date),
      p_roadmap_id,
      v_node.id
    )
    returning id into v_goal_id;

    update public.learning_roadmap_nodes
    set linked_goal_id = v_goal_id
    where id = v_node.id;

    v_goal_map := v_goal_map || jsonb_build_object(v_node.id::text, v_goal_id::text);
    v_created_goals := v_created_goals + 1;
  end loop;

  -- ==========================================================
  -- Step 2: Create parent tasks
  -- task nodes must be under goal nodes
  -- ==========================================================

  for v_node in
    select *
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'task'
    order by node.sort_order asc, node.position_y asc, node.position_x asc
  loop
    v_parent_goal_id := null;

    if v_node.parent_node_id is not null then
      v_parent_goal_id := (v_goal_map ->> v_node.parent_node_id::text)::uuid;
    end if;

    if v_parent_goal_id is null then
      raise exception 'Task node % is not connected to a valid goal.', v_node.id;
    end if;

    insert into public.tasks (
      user_id,
      goal_id,
      parent_task_id,
      title,
      description,
      due_date,
      estimated_minutes,
      source_roadmap_id,
      source_roadmap_node_id
    )
    values (
      v_user_id,
      v_parent_goal_id,
      null,
      v_node.title,
      v_node.description,
      coalesce(v_node.suggested_end_date, v_roadmap.end_date),
      greatest(1, ceil(v_node.estimated_hours * 60)::integer),
      p_roadmap_id,
      v_node.id
    )
    returning id into v_task_id;

    update public.learning_roadmap_nodes
    set linked_task_id = v_task_id
    where id = v_node.id;

    v_task_map := v_task_map || jsonb_build_object(v_node.id::text, v_task_id::text);
    v_created_tasks := v_created_tasks + 1;
  end loop;

  -- ==========================================================
  -- Step 3: Create subtasks
  -- subtask nodes become tasks with parent_task_id
  -- ==========================================================

  for v_node in
    select *
    from public.learning_roadmap_nodes node
    where node.roadmap_id = p_roadmap_id
      and node.user_id = v_user_id
      and node.node_type::text = 'subtask'
    order by node.sort_order asc, node.position_y asc, node.position_x asc
  loop
    v_parent_task_id := null;

    if v_node.parent_node_id is not null then
      v_parent_task_id := (v_task_map ->> v_node.parent_node_id::text)::uuid;
    end if;

    if v_parent_task_id is null then
      raise exception 'Subtask node % is not connected to a valid task.', v_node.id;
    end if;

    select task.goal_id
    into v_parent_goal_id
    from public.tasks task
    where task.id = v_parent_task_id
      and task.user_id = v_user_id;

    if v_parent_goal_id is null then
      raise exception 'Parent task for subtask % does not have a valid goal.', v_node.id;
    end if;

    insert into public.tasks (
      user_id,
      goal_id,
      parent_task_id,
      title,
      description,
      due_date,
      estimated_minutes,
      source_roadmap_id,
      source_roadmap_node_id
    )
    values (
      v_user_id,
      v_parent_goal_id,
      v_parent_task_id,
      v_node.title,
      v_node.description,
      coalesce(v_node.suggested_end_date, v_roadmap.end_date),
      greatest(1, ceil(v_node.estimated_hours * 60)::integer),
      p_roadmap_id,
      v_node.id
    )
    returning id into v_task_id;

    update public.learning_roadmap_nodes
    set linked_task_id = v_task_id
    where id = v_node.id;

    v_created_subtasks := v_created_subtasks + 1;
  end loop;

  -- ==========================================================
  -- Step 4: Mark roadmap as applied
  -- ==========================================================

  update public.learning_roadmaps
  set
    status = 'applied',
    applied_at = now()
  where id = p_roadmap_id
    and user_id = v_user_id;

  roadmap_id := p_roadmap_id;
  created_goals := v_created_goals;
  created_tasks := v_created_tasks;
  created_subtasks := v_created_subtasks;

  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.broadcast_study_room_message_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_room_type text;
  v_full_name text;
BEGIN
  SELECT room.room_type::text
  INTO v_room_type
  FROM public.study_rooms room
  WHERE room.id=new.room_id;

  -- Private study groups use their own explicit application Broadcast topic.
  IF v_room_type='group' THEN
    RETURN NULL;
  END IF;

  SELECT profile.full_name
  INTO v_full_name
  FROM public.profiles profile
  WHERE profile.id=new.sender_id;

  PERFORM realtime.send(
    jsonb_build_object(
      'id',new.id,
      'room_id',new.room_id,
      'sender_id',new.sender_id,
      'content',new.content,
      'created_at',new.created_at,
      'profiles',jsonb_build_object(
        'id',new.sender_id,
        'full_name',v_full_name
      )
    ),
    'INSERT',
    'study-room-chat:' || new.room_id::text,
    true
  );

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_study_group_weekly_challenge_progress(p_group_id uuid, p_week_start date, p_week_end date)
 RETURNS TABLE(group_id uuid, week_start date, week_end date, target_focus_minutes integer, target_completed_tasks integer, actual_focus_minutes integer, actual_completed_tasks integer, focus_progress_percent integer, task_progress_percent integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with authorized as materialized (
    select public.is_active_study_group_member(
      p_group_id, (select auth.uid())
    ) as allowed
  ),

  challenge as (
    select
      c.group_id,
      c.week_start,
      c.week_end,
      c.target_focus_minutes,
      c.target_completed_tasks
    from public.study_group_weekly_challenges c
    where c.group_id = p_group_id
      and c.week_start = p_week_start
    limit 1
  ),

  group_members as (
    select member.user_id
    from public.study_room_members member
    join public.study_rooms room
      on room.id = member.room_id
    where member.room_id = p_group_id
      and member.membership_status::text = 'active'
      and room.room_type::text = 'group'
      and (select allowed from authorized)
  ),

  focus_total as (
    select coalesce(sum(focus.actual_focus_minutes), 0)::integer as total
    from public.focus_sessions focus
    where focus.user_id in (select gm.user_id from group_members gm)
      and focus.ended_at is not null
      and focus.started_at >= p_week_start::timestamptz
      and focus.started_at < (p_week_end + 1)::timestamptz
  ),

  task_total as (
    select count(*)::integer as total
    from public.tasks task
    where task.user_id in (select gm.user_id from group_members gm)
      and task.status::text = 'completed'
      and task.completed_at >= p_week_start::timestamptz
      and task.completed_at < (p_week_end + 1)::timestamptz
  )

  select
    p_group_id as group_id,
    p_week_start as week_start,
    p_week_end as week_end,
    coalesce((select target_focus_minutes from challenge), 300) as target_focus_minutes,
    coalesce((select target_completed_tasks from challenge), 10) as target_completed_tasks,
    (select total from focus_total) as actual_focus_minutes,
    (select total from task_total) as actual_completed_tasks,
    case
      when coalesce((select target_focus_minutes from challenge), 300) = 0 then 100
      else least(
        100,
        round(
          (select total from focus_total)::numeric
          / coalesce((select target_focus_minutes from challenge), 300)::numeric
          * 100
        )::integer
      )
    end as focus_progress_percent,
    case
      when coalesce((select target_completed_tasks from challenge), 10) = 0 then 100
      else least(
        100,
        round(
          (select total from task_total)::numeric
          / coalesce((select target_completed_tasks from challenge), 10)::numeric
          * 100
        )::integer
      )
    end as task_progress_percent;
$function$
;

CREATE OR REPLACE FUNCTION public.get_study_group_weekly_leaderboard(p_group_id uuid, p_week_start date, p_week_end date)
 RETURNS TABLE(user_id uuid, email text, role text, focus_minutes integer, completed_tasks integer, score integer, rank_position integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with authorized as materialized (
    select public.is_active_study_group_member(
      p_group_id, (select auth.uid())
    ) as allowed
  ),

  group_members as (
    select
      member.user_id,
      member.role::text as role,
      auth_user.email::text as email
    from public.study_room_members member
    join auth.users auth_user
      on auth_user.id = member.user_id
    join public.study_rooms room
      on room.id = member.room_id
    where member.room_id = p_group_id
      and member.membership_status::text = 'active'
      and room.room_type::text = 'group'
      and (select allowed from authorized)
  ),

  focus_summary as (
    select
      focus.user_id,
      coalesce(sum(focus.actual_focus_minutes), 0)::integer as focus_minutes
    from public.focus_sessions focus
    where focus.user_id in (select gm.user_id from group_members gm)
      and focus.ended_at is not null
      and focus.started_at >= p_week_start::timestamptz
      and focus.started_at < (p_week_end + 1)::timestamptz
    group by focus.user_id
  ),

  task_summary as (
    select
      task.user_id,
      count(*)::integer as completed_tasks
    from public.tasks task
    where task.user_id in (select gm.user_id from group_members gm)
      and task.status::text = 'completed'
      and task.completed_at >= p_week_start::timestamptz
      and task.completed_at < (p_week_end + 1)::timestamptz
    group by task.user_id
  ),

  scored as (
    select
      gm.user_id,
      gm.email,
      gm.role,
      coalesce(fs.focus_minutes, 0)::integer as focus_minutes,
      coalesce(ts.completed_tasks, 0)::integer as completed_tasks,
      (
        coalesce(fs.focus_minutes, 0)
        + coalesce(ts.completed_tasks, 0) * 10
      )::integer as score
    from group_members gm
    left join focus_summary fs
      on fs.user_id = gm.user_id
    left join task_summary ts
      on ts.user_id = gm.user_id
  )

  select
    scored.user_id,
    scored.email,
    scored.role,
    scored.focus_minutes,
    scored.completed_tasks,
    scored.score,
    dense_rank() over (
      order by scored.score desc, scored.focus_minutes desc, scored.completed_tasks desc
    )::integer as rank_position
  from scored
  order by rank_position asc, scored.email asc;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_study_room(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare
  v_user_id uuid;
  v_role public.study_room_member_role;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select role
  into v_role
  from public.study_room_members
  where room_id = p_room_id
    and user_id = v_user_id
    and membership_status = 'active';

  if v_role is null then
    raise exception 'Active membership not found.';
  end if;

  if v_role = 'owner' then
    update public.study_room_members
    set left_at = now()
    where room_id = p_room_id
      and user_id = v_user_id;
      
  else
    update public.study_room_members
    set
      membership_status = 'left',
      left_at = now()
    where room_id = p_room_id
      and user_id = v_user_id;
  end if;
end;$function$
;


  create policy "Users can view accessible profiles"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (((id = ( SELECT auth.uid() AS uid)) OR public.can_view_study_room_peer_profile(id, ( SELECT auth.uid() AS uid))));



  create policy "Authorized users can insert room members"
  on "public"."study_room_members"
  as permissive
  for insert
  to authenticated
with check (((((membership_status)::text = 'active'::text) AND ((role)::text = 'member'::text) AND public.can_manage_study_group_members(room_id, ( SELECT auth.uid() AS uid))) OR ((user_id = ( SELECT auth.uid() AS uid)) AND ((membership_status)::text = 'active'::text) AND ((role)::text = ANY (ARRAY['owner'::text, 'admin'::text, 'host'::text])) AND public.is_study_group_owner(room_id, ( SELECT auth.uid() AS uid)))));



  create policy "Authorized users can update room memberships"
  on "public"."study_room_members"
  as permissive
  for update
  to authenticated
using (((user_id = ( SELECT auth.uid() AS uid)) OR public.can_manage_study_group_members(room_id, ( SELECT auth.uid() AS uid))))
with check (((user_id = ( SELECT auth.uid() AS uid)) OR public.can_manage_study_group_members(room_id, ( SELECT auth.uid() AS uid))));



  create policy "Users can view accessible room memberships"
  on "public"."study_room_members"
  as permissive
  for select
  to authenticated
using (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_active_study_room_member(room_id, ( SELECT auth.uid() AS uid)) OR public.can_manage_study_group_members(room_id, ( SELECT auth.uid() AS uid))));



  create policy "Active room members can send messages"
  on "public"."study_room_messages"
  as permissive
  for insert
  to authenticated
with check (((sender_id = ( SELECT auth.uid() AS uid)) AND public.is_active_study_room_member(room_id, ( SELECT auth.uid() AS uid))));



  create policy "Active room members can view messages"
  on "public"."study_room_messages"
  as permissive
  for select
  to authenticated
using (public.is_active_study_room_member(room_id, ( SELECT auth.uid() AS uid)));


CREATE TRIGGER handle_user_engagement_stats_realtime_changes AFTER INSERT OR UPDATE ON public.user_engagement_stats FOR EACH ROW EXECUTE FUNCTION public.broadcast_user_engagement_stats_changes();


