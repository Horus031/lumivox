BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(2);

-- Fixtures are isolated from existing accounts and rolled back after assertions.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000093', 'workspace-phase3-sql@example.test');
INSERT INTO public.profiles (id)
VALUES ('00000000-0000-4000-8000-000000000093')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tasks (user_id, title, status, due_at, completed_at)
VALUES
  ('00000000-0000-4000-8000-000000000093', 'past todo', 'todo', now() - interval '1 day', NULL),
  ('00000000-0000-4000-8000-000000000093', 'past progress', 'in_progress', now() - interval '1 day', NULL),
  ('00000000-0000-4000-8000-000000000093', 'past review', 'in_review', now() - interval '1 day', NULL),
  ('00000000-0000-4000-8000-000000000093', 'past completed', 'completed', now() - interval '1 day', now()),
  ('00000000-0000-4000-8000-000000000093', 'past cancelled', 'cancelled', now() - interval '1 day', NULL),
  ('00000000-0000-4000-8000-000000000093', 'future legacy', 'overdue', now() + interval '1 day', NULL),
  ('00000000-0000-4000-8000-000000000093', 'no deadline legacy', 'overdue', NULL, NULL),
  ('00000000-0000-4000-8000-000000000093', 'future todo', 'todo', now() + interval '1 day', NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000093', true);

DO $$
DECLARE
  payload jsonb;
  counts jsonb;
BEGIN
  payload := public.get_my_dashboard_activity(7);
  IF has_function_privilege('anon', 'public.get_my_dashboard_activity(integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_my_dashboard_activity(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Incorrect dashboard RPC grants';
  END IF;
  SELECT jsonb_object_agg(item->>'status', item->'count') INTO counts
  FROM jsonb_array_elements(payload->'taskStatusBreakdown') AS item;
  IF counts <> '{"Todo":1,"In Progress":2,"In Review":1,"Completed":1,"Overdue":2,"Cancelled":1}'::jsonb THEN
    RAISE EXCEPTION 'Incorrect dashboard distribution: %', counts;
  END IF;
  IF (payload->'summary'->>'completedTasks')::integer <> 1 THEN
    RAISE EXCEPTION 'Completion summary regressed';
  END IF;
END;
$$;

RESET ROLE;
SELECT pass('Dashboard grants, status distribution and completion summary');
DO $$
DECLARE
  task_id uuid;
  old_version timestamptz := now() - interval '1 day';
  affected integer;
BEGIN
  INSERT INTO public.tasks (user_id, title, updated_at)
  VALUES ('00000000-0000-4000-8000-000000000093', 'concurrency fixture', old_version)
  RETURNING id INTO task_id;
  UPDATE public.tasks SET status = 'in_progress'
  WHERE id = task_id AND status = 'todo' AND updated_at = old_version;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'First conditional update failed'; END IF;
  UPDATE public.tasks SET status = 'completed'
  WHERE id = task_id AND status = 'todo' AND updated_at = old_version;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Stale update overwrote the task'; END IF;
END;
$$;

SELECT pass('Conditional updates reject a stale task version');
SELECT * FROM finish();
ROLLBACK;
