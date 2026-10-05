begin;

create or replace function public.finalize_task_review_submission(
  p_attempt_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_score numeric,
  p_feedback_payload jsonb,
  p_weak_areas jsonb
)
returns table (
  attempt_id uuid,
  attempt_status public.task_review_attempt_status,
  score numeric,
  pass_threshold numeric,
  task_status public.task_status,
  task_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_threshold numeric;
  v_attempt_status public.task_review_attempt_status;
  v_task_status public.task_status;
  v_task_updated_at timestamptz;
  v_affected integer;
begin
  if p_score < 0 or p_score > 100 then
    raise exception 'Review score must be between 0 and 100.';
  end if;

  if jsonb_typeof(p_feedback_payload) <> 'object' then
    raise exception 'Feedback payload must be a JSON object.';
  end if;

  if jsonb_typeof(p_weak_areas) <> 'array' then
    raise exception 'Weak areas must be a JSON array.';
  end if;

  select review_attempt.pass_threshold
  into v_threshold
  from public.task_review_attempts review_attempt
  where review_attempt.id = p_attempt_id
    and review_attempt.user_id = p_user_id
    and review_attempt.task_id = p_task_id
    and review_attempt.status = 'ready'
  for update;

  if not found then
    raise exception
      'Review attempt is not ready for submission.';
  end if;

  if not exists (
    select 1
    from public.task_review_answer_keys answer_key
    where answer_key.attempt_id = p_attempt_id
      and answer_key.user_id = p_user_id
  ) then
    raise exception
      'Review answer key is missing.';
  end if;

  if not exists (
    select 1
    from public.tasks task
    where task.id = p_task_id
      and task.user_id = p_user_id
      and task.parent_task_id is null
      and task.status = 'in_review'
  ) then
    raise exception
      'Task is no longer in review.';
  end if;

  if p_score >= v_threshold then
    v_attempt_status =
      'passed'::public.task_review_attempt_status;

    v_task_status =
      'completed'::public.task_status;
  else
    v_attempt_status =
      'failed'::public.task_review_attempt_status;

    v_task_status =
      'in_progress'::public.task_status;
  end if;

  update public.task_review_attempts
  set
    status = v_attempt_status,
    score = p_score,
    feedback_payload = p_feedback_payload,
    weak_areas = p_weak_areas,
    submitted_at = now(),
    completed_at = now()
  where id = p_attempt_id
    and user_id = p_user_id
    and task_id = p_task_id
    and status = 'ready';

  get diagnostics v_affected = row_count;

  if v_affected <> 1 then
    raise exception
      'Review attempt changed before submission completed.';
  end if;

  update public.tasks
  set
    status = v_task_status,
    completed_at = case
      when v_attempt_status = 'passed'
        then now()
      else null
    end
  where id = p_task_id
    and user_id = p_user_id
    and parent_task_id is null
    and status = 'in_review'
  returning updated_at
  into v_task_updated_at;

  if v_task_updated_at is null then
    raise exception
      'Task changed before review submission completed.';
  end if;

  return query
  select
    p_attempt_id,
    v_attempt_status,
    p_score,
    v_threshold,
    v_task_status,
    v_task_updated_at;
end;
$$;

revoke all
on function public.finalize_task_review_submission(
  uuid,
  uuid,
  uuid,
  numeric,
  jsonb,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.finalize_task_review_submission(
  uuid,
  uuid,
  uuid,
  numeric,
  jsonb,
  jsonb
)
to service_role;

commit;