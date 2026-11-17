begin;

alter table public.task_risk_recovery_attempts
  add column receipt_required boolean not null default false,
  add column receipt_recorded_at timestamptz;

-- The marker is consumed by the trigger and is never stored on the entity.
alter table public.tasks add column recovery_attempt_id uuid check (recovery_attempt_id is null);
alter table public.focus_sessions add column recovery_attempt_id uuid;

create schema if not exists task_risk_private;
revoke all on schema task_risk_private from public, anon, authenticated, service_role;

-- Keep Phase 5 writes compatible during rolling deploys. Only the new
-- entrypoint opts fresh attempts into the receipt-only completion path.
create function task_risk_private.start_attempt(
  p_user_id uuid, p_task_id uuid, p_prediction_id uuid, p_action_type text, p_key uuid, p_receipt_required boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  attempt public.task_risk_recovery_attempts;
  original_due timestamptz;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_user_id then
    raise exception 'Prediction unavailable or stale' using errcode = '22023';
  end if;
  select * into attempt from public.task_risk_recovery_attempts
    where user_id = p_user_id and idempotency_key = p_key;
  if not found then
    select coalesce(t.due_at, (t.due_date + 1)::timestamp at time zone 'UTC') into original_due
    from public.tasks t join public.deadline_risk_predictions p
      on p.task_id = t.id and p.user_id = t.user_id
    join public.ml_model_versions m on m.id = p.model_version_id
    left join public.native_task_risk_input_revisions r on r.user_id = t.user_id
    where t.id = p_task_id and t.user_id = p_user_id
      and t.status not in ('completed','cancelled') and t.completed_at is null
      and p.id = p_prediction_id and p.input_mode = 'lumivox_native_features'
      and p.prediction_metadata->>'prediction_mode' = 'native_ml'
      and p.prediction_metadata->>'risk_band' in ('moderate','elevated','high')
      and coalesce(p.prediction_metadata->'recommended_actions', '[]'::jsonb)
        @> jsonb_build_array(jsonb_build_object('action_type', p_action_type))
      and p.prediction_metadata->>'feature_schema_version' = 'native-task-risk-v2'
      and p.prediction_metadata->'input_revision' = to_jsonb(coalesce(r.revision,0))
      and p.prediction_metadata->>'due_at' is not null
      and (p.prediction_metadata->>'due_at')::timestamptz =
        coalesce(t.due_at, (t.due_date + 1)::timestamp at time zone 'UTC')
      and m.is_active and m.model_key = 'native_task_delay_risk_classifier'
      and m.algorithm = 'logistic_regression_balanced'
      and p.created_at >= greatest(t.updated_at, statement_timestamp() - interval '6 hours')
      and p.created_at <= statement_timestamp() + interval '1 minute'
      and (p.created_at at time zone 'UTC')::date = (statement_timestamp() at time zone 'UTC')::date
      and coalesce(t.due_at, (t.due_date + 1)::timestamp at time zone 'UTC')
        between statement_timestamp() and statement_timestamp() + interval '336 hours'
      and not exists (
        select 1 from public.deadline_risk_predictions newer
        where newer.user_id = p_user_id and newer.task_id = p_task_id
          and newer.input_mode = 'lumivox_native_features'
          and (newer.created_at,newer.id) > (p.created_at,p.id)
      );
    if original_due is null then
      raise exception 'Prediction unavailable or stale' using errcode = '22023';
    end if;
    insert into public.task_risk_recovery_attempts
      (user_id,task_id,source_prediction_id,action_type,idempotency_key,original_due_at,receipt_required)
    values (p_user_id,p_task_id,p_prediction_id,p_action_type,p_key,original_due,p_receipt_required)
    on conflict (user_id,idempotency_key) do nothing;
    select * into strict attempt from public.task_risk_recovery_attempts
      where user_id = p_user_id and idempotency_key = p_key;
  end if;
  if (attempt.task_id,attempt.source_prediction_id,attempt.action_type)
       is distinct from (p_task_id,p_prediction_id,p_action_type) then
    raise exception 'Recovery key reused with different request' using errcode = '22023';
  end if;
  return attempt.id;
end;
$$;

create or replace function public.start_verified_task_risk_recovery(
  p_user_id uuid,p_task_id uuid,p_prediction_id uuid,p_action_type text,p_key uuid
) returns uuid language sql security definer set search_path = '' as $$
  select task_risk_private.start_attempt(p_user_id,p_task_id,p_prediction_id,p_action_type,p_key,false);
$$;

create function public.start_receipted_task_risk_recovery(
  p_user_id uuid,p_task_id uuid,p_prediction_id uuid,p_action_type text,p_key uuid
) returns uuid language sql security definer set search_path = '' as $$
  select task_risk_private.start_attempt(p_user_id,p_task_id,p_prediction_id,p_action_type,p_key,true);
$$;
revoke all on function public.start_receipted_task_risk_recovery(uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_receipted_task_risk_recovery(uuid,uuid,uuid,text,uuid)
  to service_role;

create table task_risk_private.receipts (
  attempt_id uuid primary key references public.task_risk_recovery_attempts(id) on delete cascade,
  user_id uuid not null,
  task_id uuid not null,
  action_type text not null,
  entity_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  fingerprint jsonb
);
create index task_risk_pending_receipts_idx on public.task_risk_recovery_attempts(receipt_recorded_at,id)
where status = 'initiated' and receipt_recorded_at is not null;

create function task_risk_private.require_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from task_risk_private.receipts r
    where (r.attempt_id,r.user_id,r.task_id,r.action_type,r.recorded_at)=
      (new.id,new.user_id,new.task_id,new.action_type,new.applied_at)
      and new.applied_entity_id is not distinct from
        case when r.action_type in ('start_focus','split_task') then r.entity_id end
  ) then raise exception 'Recovery receipt required' using errcode='22023'; end if;
  return new;
end;
$$;

create trigger require_task_risk_recovery_receipt before update of status on public.task_risk_recovery_attempts
for each row when (new.receipt_required and old.status<>'applied' and new.status='applied')
execute function task_risk_private.require_receipt();

create function task_risk_private.record_receipt(
  p_attempt uuid, p_user uuid, p_task uuid, p_action text, p_entity uuid, p_fingerprint jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.task_risk_recovery_attempts;
begin
  select * into a from public.task_risk_recovery_attempts
    where id=p_attempt and user_id=p_user and task_id=p_task for update;
  if not found or a.action_type is distinct from p_action or
      (auth.uid() is not null and auth.uid() is distinct from p_user) then
    raise exception 'Invalid recovery attempt' using errcode='22023';
  end if;
  if a.status <> 'initiated' or a.receipt_recorded_at is not null then
    raise exception 'Recovery attempt already resolved' using errcode='PT409';
  end if;
  insert into task_risk_private.receipts(attempt_id,user_id,task_id,action_type,entity_id,fingerprint)
    values(p_attempt,p_user,p_task,p_action,p_entity,p_fingerprint);
  update public.task_risk_recovery_attempts set receipt_recorded_at=(
    select recorded_at from task_risk_private.receipts where attempt_id=p_attempt
  ) where id=p_attempt;
end;
$$;

create function task_risk_private.capture_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  marker uuid := new.recovery_attempt_id;
  action text;
begin
  new.recovery_attempt_id := null;
  if tg_table_name='focus_sessions' then
    if new.session_mode <> 'legacy' or new.task_id is null then
      raise exception 'Invalid recovery mutation' using errcode='22023';
    end if;
    perform task_risk_private.record_receipt(marker,new.user_id,new.task_id,'start_focus',new.id);
  elsif tg_op='INSERT' then
    if new.parent_task_id is null then raise exception 'Invalid recovery mutation' using errcode='22023'; end if;
    perform task_risk_private.record_receipt(marker,new.user_id,new.parent_task_id,'split_task',new.id);
  else
    select action_type into action from public.task_risk_recovery_attempts
      where id=marker and user_id=new.user_id and task_id=new.id;
    if action='reschedule' and coalesce(new.due_at,(new.due_date+1)::timestamp at time zone 'UTC') is not null
      and coalesce(new.due_at,(new.due_date+1)::timestamp at time zone 'UTC')
        is distinct from coalesce(old.due_at,(old.due_date+1)::timestamp at time zone 'UTC') then
      perform task_risk_private.record_receipt(marker,new.user_id,new.id,action,new.id);
    elsif action='reduce_scope' and new.estimated_minutes < old.estimated_minutes then
      perform task_risk_private.record_receipt(marker,new.user_id,new.id,action,new.id);
    elsif action is null or action not in ('reschedule','reduce_scope') then
      raise exception 'Invalid recovery mutation' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger zz_capture_task_recovery_receipt before insert or update on public.tasks
for each row when (new.recovery_attempt_id is not null) execute function task_risk_private.capture_receipt();
create trigger zz_capture_legacy_focus_recovery_receipt before insert on public.focus_sessions
for each row when (new.recovery_attempt_id is not null) execute function task_risk_private.capture_receipt();
-- Only inserts can supply a Legacy Focus marker.
alter table public.focus_sessions add check (recovery_attempt_id is null);

create function public.create_recovery_focus_v2(
  p_attempt_id uuid, p_user_id uuid, p_task_id uuid, p_focus_minutes integer,
  p_short_break_minutes integer, p_long_break_minutes integer, p_round_count integer,
  p_long_break_every integer, p_auto_start_breaks boolean, p_auto_start_focus boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  session_id uuid;
  a public.task_risk_recovery_attempts;
  prior task_risk_private.receipts;
  payload jsonb := jsonb_build_array(p_focus_minutes,p_short_break_minutes,p_long_break_minutes,
    p_round_count,p_long_break_every,p_auto_start_breaks,p_auto_start_focus);
begin
  select * into a from public.task_risk_recovery_attempts
    where id=p_attempt_id and user_id=p_user_id and task_id=p_task_id and action_type='start_focus'
    for update;
  if not found or (auth.uid() is not null and auth.uid() is distinct from p_user_id) then
    raise exception 'Invalid recovery attempt' using errcode='22023';
  end if;
  select * into prior from task_risk_private.receipts where attempt_id=a.id;
  if found then
    if prior.fingerprint is distinct from payload then
      raise exception 'Recovery attempt already resolved' using errcode='PT409';
    end if;
    return prior.entity_id;
  end if;
  if a.status <> 'initiated' then raise exception 'Recovery attempt already resolved' using errcode='PT409'; end if;
  session_id := public.focus_v2_create_session(p_user_id,p_task_id,p_focus_minutes,p_short_break_minutes,
    p_long_break_minutes,p_round_count,p_long_break_every,p_auto_start_breaks,p_auto_start_focus);
  perform task_risk_private.record_receipt(a.id,p_user_id,p_task_id,'start_focus',session_id,payload);
  return session_id;
end;
$$;

create function public.reconcile_task_risk_recovery(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  affected integer;
begin
  with ready as (
    select a.id,r.recorded_at,r.entity_id,r.action_type
    from public.task_risk_recovery_attempts a
    join task_risk_private.receipts r on (r.attempt_id,r.user_id,r.task_id,r.action_type)=(a.id,a.user_id,a.task_id,a.action_type)
    where a.status='initiated' and a.receipt_recorded_at=r.recorded_at
    order by a.receipt_recorded_at,a.id
    limit least(greatest(coalesce(p_limit,50),0),200)
    for update of a skip locked
  )
  update public.task_risk_recovery_attempts a set status='applied',applied_at=ready.recorded_at,
    applied_entity_id=case when ready.action_type in ('start_focus','split_task') then ready.entity_id end
  from ready where a.id=ready.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function public.abandon_task_risk_recovery(p_attempt_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  with changed as (
    update public.task_risk_recovery_attempts set status='abandoned'
      where id=p_attempt_id and user_id=(select auth.uid()) and status='initiated'
        and receipt_required and receipt_recorded_at is null returning id
  )
  select exists(select 1 from changed);
$$;

create table task_risk_private.reassessments (
  user_id uuid not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  attempt_id uuid not null references public.task_risk_recovery_attempts(id) on delete cascade,
  request_id uuid primary key default gen_random_uuid(),
  reserved_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz
);
create index task_risk_reassess_task_idx on task_risk_private.reassessments(user_id,task_id,reserved_at desc);
create index task_risk_reassess_attempt_idx on task_risk_private.reassessments(attempt_id,reserved_at desc);

create function task_risk_private.is_fresh_reassessment(p_id uuid,p_owner uuid,p_task uuid,p_applied timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.deadline_risk_predictions p
    join public.ml_model_versions m on m.id=p.model_version_id
    join public.tasks t on (t.id,t.user_id)=(p.task_id,p.user_id)
    left join public.native_task_risk_input_revisions rev on rev.user_id=p.user_id
    where (p.id,p.user_id,p.task_id)=(p_id,p_owner,p_task)
      and p.input_mode='lumivox_native_features'
      and p.prediction_metadata->>'prediction_mode'='native_ml'
      and p.prediction_metadata->>'feature_schema_version'='native-task-risk-v2'
      and p.prediction_metadata->'input_revision'=to_jsonb(coalesce(rev.revision,0))
      and p.prediction_metadata->>'due_at' is not null
      and (p.prediction_metadata->>'due_at')::timestamptz =
          coalesce(t.due_at,(t.due_date+1)::timestamp at time zone 'UTC')
      and m.is_active and m.model_key='native_task_delay_risk_classifier'
      and m.algorithm='logistic_regression_balanced'
      and p.created_at>p_applied and p.created_at>=t.updated_at
      and p.created_at between statement_timestamp()-interval '6 hours' and statement_timestamp()+interval '1 minute'
      and (p.created_at at time zone 'UTC')::date=(statement_timestamp() at time zone 'UTC')::date
      and t.status not in ('completed','cancelled') and t.completed_at is null
      and coalesce(t.due_at,(t.due_date+1)::timestamp at time zone 'UTC')
          between statement_timestamp() and statement_timestamp()+interval '336 hours'
  );
$$;

create function public.pair_task_risk_reassessment(p_user_id uuid,p_attempt_id uuid,p_request_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  with changed as (
    update public.task_risk_recovery_attempts a
      set reassessment_prediction_id=p_request_id,evaluated_at=clock_timestamp()
    where a.id=p_attempt_id and a.user_id=p_user_id and a.status='applied'
      and a.reassessment_prediction_id is null
      and exists (select 1 from task_risk_private.reassessments j
                  where (j.request_id,j.user_id,j.task_id,j.attempt_id)=(p_request_id,a.user_id,a.task_id,a.id)
                    and j.started_at is not null)
      and task_risk_private.is_fresh_reassessment(p_request_id,a.user_id,a.task_id,a.applied_at)
    returning id
  )
  select exists(select 1 from changed) or exists (
    select 1 from public.task_risk_recovery_attempts
      where id=p_attempt_id and user_id=p_user_id and reassessment_prediction_id=p_request_id
  );
$$;

-- Reservation and prediction ID are identical so a committed response can be
-- recovered even when the ML HTTP response never reaches the web process.
create function public.reserve_task_risk_reassessment(p_user_id uuid,p_attempt_id uuid,p_allow_dispatch boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.task_risk_recovery_attempts;
  job task_risk_private.reassessments;
  reserved timestamptz;
begin
  select * into a from public.task_risk_recovery_attempts
    where id=p_attempt_id and user_id=p_user_id and status='applied';
  if not found then return null; end if;
  if a.reassessment_prediction_id is not null then
    return jsonb_build_object('kind','done','id',a.reassessment_prediction_id);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || a.task_id::text,0));
  reserved := clock_timestamp();

  select j.* into job from task_risk_private.reassessments j
    where j.attempt_id=a.id and j.started_at is not null
      and task_risk_private.is_fresh_reassessment(j.request_id,a.user_id,a.task_id,a.applied_at)
    order by j.reserved_at desc limit 1;
  if found then return jsonb_build_object('kind','persisted','id',job.request_id); end if;
  if p_allow_dispatch is not true then return null; end if;

  select * into job from task_risk_private.reassessments
    where user_id=p_user_id and task_id=a.task_id order by reserved_at desc limit 1 for update;

  -- Unclaimed requests expire. A claimed request remains fenced until the
  -- worker exits or an operator confirms that a crashed worker has stopped.
  if reserved < job.reserved_at + interval '120 seconds' or
     (job.started_at is not null and job.finished_at is null) then
    return null;
  end if;
  insert into task_risk_private.reassessments(user_id,task_id,attempt_id,reserved_at)
    values(p_user_id,a.task_id,a.id,reserved) returning * into job;
  return jsonb_build_object('kind','dispatch','id',job.request_id);
end;
$$;

create function public.claim_task_risk_reassessment(p_user_id uuid,p_task_id uuid,p_request_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  with changed as (
    update task_risk_private.reassessments set started_at=clock_timestamp()
    where user_id=p_user_id and task_id=p_task_id and request_id=p_request_id
      and started_at is null and reserved_at > clock_timestamp()-interval '120 seconds'
    returning request_id
  ) select exists(select 1 from changed);
$$;

create function public.finish_task_risk_reassessment(p_user_id uuid,p_task_id uuid,p_request_id uuid)
returns void language sql security definer set search_path = '' as $$
  update task_risk_private.reassessments set finished_at=clock_timestamp()
    where user_id=p_user_id and task_id=p_task_id and request_id=p_request_id and started_at is not null;
$$;

revoke all on all functions in schema task_risk_private from public, anon, authenticated, service_role;
revoke all on function public.abandon_task_risk_recovery(uuid) from public, anon, authenticated, service_role;
grant execute on function public.abandon_task_risk_recovery(uuid) to authenticated;
revoke all on function
  public.create_recovery_focus_v2(uuid,uuid,uuid,integer,integer,integer,integer,integer,boolean,boolean),
  public.reconcile_task_risk_recovery(integer),
  public.reserve_task_risk_reassessment(uuid,uuid,boolean),
  public.pair_task_risk_reassessment(uuid,uuid,uuid),
  public.claim_task_risk_reassessment(uuid,uuid,uuid),
  public.finish_task_risk_reassessment(uuid,uuid,uuid)
from public, anon, authenticated, service_role;
grant execute on function
  public.create_recovery_focus_v2(uuid,uuid,uuid,integer,integer,integer,integer,integer,boolean,boolean),
  public.reconcile_task_risk_recovery(integer),
  public.reserve_task_risk_reassessment(uuid,uuid,boolean),
  public.pair_task_risk_reassessment(uuid,uuid,uuid),
  public.claim_task_risk_reassessment(uuid,uuid,uuid),
  public.finish_task_risk_reassessment(uuid,uuid,uuid)
to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('task-risk-recovery-reconcile','* * * * *',
      'select public.reconcile_task_risk_recovery(50)');
  end if;
end;
$$;

commit;
