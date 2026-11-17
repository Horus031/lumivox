begin;

create table public.task_risk_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  source_prediction_id uuid not null references public.deadline_risk_predictions(id) on delete cascade,
  action_type text not null check (action_type in ('start_focus','split_task','reschedule','reduce_scope')),
  status text not null default 'initiated' check (status in ('initiated','applied','abandoned')),
  idempotency_key uuid not null,
  initiated_at timestamptz not null default clock_timestamp(),
  original_due_at timestamptz not null,
  applied_at timestamptz,
  applied_entity_id uuid,
  reassessment_prediction_id uuid references public.deadline_risk_predictions(id),
  evaluated_at timestamptz,
  reassessment_requested_at timestamptz,
  unique (user_id, idempotency_key),
  check ((status = 'applied') = (applied_at is not null)),
  check ((reassessment_prediction_id is null) = (evaluated_at is null)),
  check (evaluated_at is null or (applied_at is not null and evaluated_at >= applied_at))
);

create index task_risk_recovery_owner_task_idx
  on public.task_risk_recovery_attempts(user_id, task_id, initiated_at desc);
alter table public.task_risk_recovery_attempts enable row level security;
revoke all on public.task_risk_recovery_attempts from public, anon, authenticated, service_role;
grant select on public.task_risk_recovery_attempts to authenticated;
grant select, update (reassessment_requested_at, reassessment_prediction_id, evaluated_at)
  on public.task_risk_recovery_attempts to service_role;
create policy task_risk_recovery_owner_read on public.task_risk_recovery_attempts
  for select to authenticated using (user_id = (select auth.uid()));

-- Only the application server calls the two write RPCs. The actor is obtained
-- from the authenticated session by the server and independently scoped here.
create function public.start_verified_task_risk_recovery(
  p_user_id uuid, p_task_id uuid, p_prediction_id uuid, p_action_type text, p_key uuid
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
      (user_id,task_id,source_prediction_id,action_type,idempotency_key,original_due_at)
    values (p_user_id,p_task_id,p_prediction_id,p_action_type,p_key,original_due)
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

create function public.complete_verified_task_risk_recovery(
  p_user_id uuid, p_attempt_id uuid, p_task_id uuid, p_action_type text,
  p_entity_id uuid default null, p_task_updated_at timestamptz default null,
  p_previous_due_at timestamptz default null, p_previous_minutes integer default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  attempt public.task_risk_recovery_attempts;
  evidence_at timestamptz;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_user_id then return false; end if;
  select * into attempt from public.task_risk_recovery_attempts where
    id = p_attempt_id and user_id = p_user_id and task_id = p_task_id and action_type = p_action_type
    for update;
  if not found then return false; end if;
  if attempt.status = 'applied' then
    return attempt.applied_entity_id is not distinct from p_entity_id
      and (p_entity_id is not null or attempt.applied_at is not distinct from p_task_updated_at);
  end if;
  if attempt.status <> 'initiated' then return false; end if;

  if p_action_type = 'start_focus' then
    select f.created_at into evidence_at from public.focus_sessions f
      where f.id = p_entity_id and f.user_id = p_user_id and f.task_id = p_task_id;
  elsif p_action_type = 'split_task' then
    select t.created_at into evidence_at from public.tasks t
      where t.id = p_entity_id and t.user_id = p_user_id and t.parent_task_id = p_task_id;
  else
    select t.updated_at into evidence_at from public.tasks t
      where t.id = p_task_id and t.user_id = p_user_id and t.updated_at = p_task_updated_at
        and p_entity_id is null
        and ((p_action_type = 'reschedule' and
          coalesce(t.due_at,(t.due_date + 1)::timestamp at time zone 'UTC') is not null and
          coalesce(t.due_at,(t.due_date + 1)::timestamp at time zone 'UTC') is distinct from p_previous_due_at)
          or (p_action_type = 'reduce_scope' and t.estimated_minutes < p_previous_minutes));
  end if;
  if evidence_at is null or evidence_at < attempt.initiated_at then return false; end if;
  update public.task_risk_recovery_attempts set status = 'applied', applied_at = evidence_at,
    applied_entity_id = p_entity_id where id = attempt.id;
  return true;
end;
$$;

revoke all on function public.start_verified_task_risk_recovery(uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_verified_task_risk_recovery(uuid,uuid,uuid,text,uuid) to service_role;
revoke all on function public.complete_verified_task_risk_recovery(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_verified_task_risk_recovery(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,integer)
  to service_role;

commit;
