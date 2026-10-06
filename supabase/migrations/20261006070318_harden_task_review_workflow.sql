begin;

alter table public.task_review_attempts
add column if not exists generation_request_id uuid;

alter table public.task_review_attempts
add column if not exists submission_fingerprint text;


create unique index if not exists
idx_task_review_attempts_generation_request
on public.task_review_attempts(
  user_id,
  task_id,
  generation_request_id
)
where generation_request_id is not null;


alter table public.task_review_attempts
drop constraint if exists
task_review_submission_fingerprint_format;

alter table public.task_review_attempts
add constraint task_review_submission_fingerprint_format
check (
  submission_fingerprint is null
  or submission_fingerprint ~ '^[0-9a-f]{64}$'
);

create or replace function public.begin_task_review_generation(
  p_user_id uuid,
  p_task_id uuid,
  p_expected_status public.task_status,
  p_expected_updated_at timestamptz,
  p_generation_request_id uuid,
  p_pass_threshold numeric,
  p_task_snapshot jsonb,
  p_source_snapshot jsonb,
  p_stale_after_seconds integer default 900
)
returns table (
  attempt_id uuid,
  attempt_number integer,
  attempt_status public.task_review_attempt_status,
  reused boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task_status public.task_status;
  v_task_updated_at timestamptz;

  v_existing public.task_review_attempts%rowtype;

  v_next_attempt_number integer;
  v_attempt_id uuid;
begin
  if p_generation_request_id is null then
    raise exception
      'Generation request id is required.';
  end if;

  if p_pass_threshold < 50
    or p_pass_threshold > 100
  then
    raise exception
      'Review pass threshold must be between 50 and 100.';
  end if;

  if p_stale_after_seconds < 60
    or p_stale_after_seconds > 3600
  then
    raise exception
      'Invalid stale generation window.';
  end if;


  -- Serialize review lifecycle changes for this Task.
  select
    task.status,
    task.updated_at
  into
    v_task_status,
    v_task_updated_at
  from public.tasks task
  where task.id = p_task_id
    and task.user_id = p_user_id
    and task.parent_task_id is null
  for update;

  if not found then
    raise exception
      'Review requires an owned root task.';
  end if;


  -- Recover a worker/process that died after reserving an
  -- attempt but before finishing generation.
  update public.task_review_attempts attempt
  set
    status = 'generation_failed',
    generation_error =
      'AI Review generation did not finish. Please try again.'
  where attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
    and attempt.status = 'generating'
    and attempt.created_at <
      now()
      - make_interval(
          secs => p_stale_after_seconds
        );


  -- Exact infrastructure retry.
  select attempt.*
  into v_existing
  from public.task_review_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
    and attempt.generation_request_id =
      p_generation_request_id
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.attempt_number,
      v_existing.status,
      true;

    return;
  end if;


  if p_expected_status not in (
    'in_progress'::public.task_status,
    'overdue'::public.task_status
  ) then
    raise exception
      'Task must be active before review.';
  end if;


  if v_task_status <> p_expected_status
    or v_task_updated_at <> p_expected_updated_at
  then
    raise exception
      'Task changed before review generation started.';
  end if;


  if exists (
    select 1
    from public.tasks child
    where child.parent_task_id = p_task_id
      and child.user_id = p_user_id
      and child.status not in (
        'completed'::public.task_status,
        'cancelled'::public.task_status
      )
  ) then
    raise exception
      'All active subtasks must be resolved before review.';
  end if;


  -- Different retry/request while another valid generation
  -- is already running: return that attempt rather than 500.
  select attempt.*
  into v_existing
  from public.task_review_attempts attempt
  where attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
    and attempt.status in (
      'generating',
      'ready'
    )
  order by attempt.attempt_number desc
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.attempt_number,
      v_existing.status,
      true;

    return;
  end if;


  select
    coalesce(
      max(attempt.attempt_number),
      0
    ) + 1
  into v_next_attempt_number
  from public.task_review_attempts attempt
  where attempt.task_id = p_task_id;


  insert into public.task_review_attempts (
    user_id,
    task_id,
    attempt_number,
    status,
    pass_threshold,
    task_snapshot,
    source_snapshot,
    generation_request_id
  )
  values (
    p_user_id,
    p_task_id,
    v_next_attempt_number,
    'generating',
    p_pass_threshold,
    p_task_snapshot,
    p_source_snapshot,
    p_generation_request_id
  )
  returning id
  into v_attempt_id;


  return query
  select
    v_attempt_id,
    v_next_attempt_number,
    'generating'::public.task_review_attempt_status,
    false;
end;
$$;


revoke all
on function public.begin_task_review_generation(
  uuid,
  uuid,
  public.task_status,
  timestamptz,
  uuid,
  numeric,
  jsonb,
  jsonb,
  integer
)
from public, anon, authenticated;


grant execute
on function public.begin_task_review_generation(
  uuid,
  uuid,
  public.task_status,
  timestamptz,
  uuid,
  numeric,
  jsonb,
  jsonb,
  integer
)
to service_role;

create or replace function public.finalize_task_review_submission_v2(
  p_attempt_id uuid,
  p_user_id uuid,
  p_task_id uuid,
  p_score numeric,
  p_feedback_payload jsonb,
  p_weak_areas jsonb,
  p_submission_fingerprint text
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

  v_existing_status
    public.task_review_attempt_status;

  v_existing_score numeric;

  v_existing_fingerprint text;

  v_attempt_status
    public.task_review_attempt_status;

  v_task_status public.task_status;
  v_task_updated_at timestamptz;

  v_affected integer;
begin
  if p_score < 0
    or p_score > 100
  then
    raise exception
      'Review score must be between 0 and 100.';
  end if;

  if p_submission_fingerprint
    !~ '^[0-9a-f]{64}$'
  then
    raise exception
      'Invalid submission fingerprint.';
  end if;

  if jsonb_typeof(
    p_feedback_payload
  ) <> 'object'
  then
    raise exception
      'Feedback payload must be an object.';
  end if;

  if jsonb_typeof(
    p_weak_areas
  ) <> 'array'
  then
    raise exception
      'Weak areas must be an array.';
  end if;


  select
    attempt.status,
    attempt.pass_threshold,
    attempt.score,
    attempt.submission_fingerprint
  into
    v_existing_status,
    v_threshold,
    v_existing_score,
    v_existing_fingerprint
  from public.task_review_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.user_id = p_user_id
    and attempt.task_id = p_task_id
  for update;


  if not found then
    raise exception
      'Review attempt was not found.';
  end if;


  -- Response-loss / network retry.
  if v_existing_status in (
    'passed',
    'failed'
  ) then
    if v_existing_fingerprint
      is distinct from
      p_submission_fingerprint
    then
      raise exception
        'Review was already submitted with a different answer payload.';
    end if;


    select
      task.status,
      task.updated_at
    into
      v_task_status,
      v_task_updated_at
    from public.tasks task
    where task.id = p_task_id
      and task.user_id = p_user_id;


    if not found then
      raise exception
        'Task no longer exists.';
    end if;


    return query
    select
      p_attempt_id,
      v_existing_status,
      v_existing_score,
      v_threshold,
      v_task_status,
      v_task_updated_at;

    return;
  end if;


  if v_existing_status <> 'ready' then
    raise exception
      'Review attempt is not ready for submission.';
  end if;


  if not exists (
    select 1
    from public.task_review_answer_keys answer_key
    where answer_key.attempt_id =
      p_attempt_id
      and answer_key.user_id =
        p_user_id
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
      'passed';

    v_task_status =
      'completed';
  else
    v_attempt_status =
      'failed';

    v_task_status =
      'in_progress';
  end if;


  update public.task_review_attempts
  set
    status =
      v_attempt_status,

    score =
      p_score,

    feedback_payload =
      p_feedback_payload,

    weak_areas =
      p_weak_areas,

    submission_fingerprint =
      p_submission_fingerprint,

    submitted_at =
      now(),

    completed_at =
      now()
  where id = p_attempt_id
    and user_id = p_user_id
    and task_id = p_task_id
    and status = 'ready';


  get diagnostics
    v_affected = row_count;


  if v_affected <> 1 then
    raise exception
      'Review attempt changed before submission completed.';
  end if;


  update public.tasks
  set
    status =
      v_task_status,

    completed_at =
      case
        when v_attempt_status =
          'passed'
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
on function public.finalize_task_review_submission_v2(
  uuid,
  uuid,
  uuid,
  numeric,
  jsonb,
  jsonb,
  text
)
from public, anon, authenticated;


grant execute
on function public.finalize_task_review_submission_v2(
  uuid,
  uuid,
  uuid,
  numeric,
  jsonb,
  jsonb,
  text
)
to service_role;

create table if not exists public.task_status_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  task_id uuid not null
    references public.tasks(id)
    on delete cascade,

  review_attempt_id uuid
    references public.task_review_attempts(id)
    on delete set null,

  from_status public.task_status not null,
  to_status public.task_status not null,

  source text not null,

  actor_role text not null,

  occurred_at timestamptz
    not null default now()
);


create index if not exists
idx_task_status_events_task_time
on public.task_status_events(
  task_id,
  occurred_at desc
);


create index if not exists
idx_task_status_events_user_time
on public.task_status_events(
  user_id,
  occurred_at desc
);


alter table public.task_status_events
enable row level security;


create policy
"Clients cannot access task status audit events"
on public.task_status_events
for all
to authenticated
using (false)
with check (false);


revoke all
on public.task_status_events
from anon, authenticated;


grant select
on public.task_status_events
to service_role;

create schema if not exists private;

revoke all
on schema private
from public, anon, authenticated;


create or replace function private.record_task_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
  v_attempt_id uuid;
begin
  v_source :=
    case
      when current_user = 'authenticated'
        then 'user_action'

      when
        old.status <> 'in_review'
        and new.status = 'in_review'
        then 'review_generation'

      when
        old.status = 'in_review'
        and new.status = 'completed'
        then 'review_pass'

      when
        old.status = 'in_review'
        and new.status = 'in_progress'
        then 'review_fail'

      else 'service_action'
    end;


  if new.status = 'in_review' then
    select attempt.id
    into v_attempt_id
    from public.task_review_attempts attempt
    where attempt.task_id = new.id
      and attempt.user_id = new.user_id
      and attempt.status = 'ready'
    order by attempt.attempt_number desc
    limit 1;

  elsif old.status = 'in_review' then
    select attempt.id
    into v_attempt_id
    from public.task_review_attempts attempt
    where attempt.task_id = new.id
      and attempt.user_id = new.user_id
      and attempt.status in (
        'passed',
        'failed'
      )
    order by attempt.attempt_number desc
    limit 1;
  end if;


  insert into public.task_status_events (
    user_id,
    task_id,
    review_attempt_id,
    from_status,
    to_status,
    source,
    actor_role
  )
  values (
    new.user_id,
    new.id,
    v_attempt_id,
    old.status,
    new.status,
    v_source,
    current_user
  );


  return new;
end;
$$;


revoke all
on function private.record_task_status_event()
from public, anon, authenticated;


drop trigger if exists
trg_record_task_status_event
on public.tasks;


create trigger trg_record_task_status_event
after update of status
on public.tasks
for each row
when (
  old.status is distinct from new.status
)
execute function
private.record_task_status_event();

commit;