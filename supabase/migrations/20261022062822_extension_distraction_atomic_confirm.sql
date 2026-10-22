begin;

create or replace function public.extension_confirm_distraction(
  p_event_id uuid,
  p_session_id uuid,
  p_segment_id uuid,
  p_category text,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_parent public.focus_sessions%rowtype;
  v_segment public.focus_session_segments%rowtype;
  v_existing public.distraction_events%rowtype;
  v_inserted_id uuid;
begin
  -- Never trust a user ID from an extension request.
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if p_event_id is null
     or p_session_id is null
     or p_segment_id is null
     or p_category is null
     or p_category not in ('social_media', 'messaging')
     or p_duration_seconds is null
     or p_duration_seconds < 30
     or p_duration_seconds > 900 then
    raise exception using
      errcode = '22023',
      message = 'Invalid distraction input';
  end if;

  -- Previously committed retries remain valid even if
  -- the original session has since finished.
  select *
    into v_existing
  from public.distraction_events
  where user_id = v_user_id
    and extension_event_id = p_event_id;

  if found then
    if v_existing.session_id <> p_session_id
       or v_existing.extension_segment_id <> p_segment_id
       or v_existing.distraction_type::text <> p_category
       or v_existing.duration_seconds <> p_duration_seconds then
      raise exception using
        errcode = 'P0001',
        message = 'Idempotency payload mismatch';
    end if;

    return jsonb_build_object(
      'saved', true,
      'duplicate', true,
      'id', v_existing.id
    );
  end if;

  -- Same lock ordering as focus_v2_transition:
  -- parent first, segment second.
  select *
    into v_parent
  from public.focus_sessions
  where id = p_session_id
    and user_id = v_user_id
    and session_mode = 'pomodoro'
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Focus session unavailable';
  end if;

  -- Recheck after acquiring the parent lock.
  -- Another confirmation may have committed while
  -- this transaction was waiting for the lock.
  select *
    into v_existing
  from public.distraction_events
  where user_id = v_user_id
    and extension_event_id = p_event_id;

  if found then
    if v_existing.session_id <> p_session_id
       or v_existing.extension_segment_id <> p_segment_id
       or v_existing.distraction_type::text <> p_category
       or v_existing.duration_seconds <> p_duration_seconds then
      raise exception using
        errcode = 'P0001',
        message = 'Idempotency payload mismatch';
    end if;

    return jsonb_build_object(
      'saved', true,
      'duplicate', true,
      'id', v_existing.id
    );
  end if;

  if v_parent.status <> 'ongoing' then
    raise exception using
      errcode = 'P0001',
      message = 'Focus session is not running';
  end if;

  select *
    into v_segment
  from public.focus_session_segments
  where id = p_segment_id
    and session_id = p_session_id
    and segment_kind = 'focus'
    and status = 'running'
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Focus segment changed';
  end if;

  insert into public.distraction_events (
    user_id,
    session_id,
    extension_event_id,
    extension_segment_id,
    distraction_type,
    duration_seconds,
    note
  )
  values (
    v_user_id,
    p_session_id,
    p_event_id,
    p_segment_id,
    p_category::public.distraction_type,
    p_duration_seconds,
    null
  )
  on conflict (user_id, extension_event_id)
    where extension_event_id is not null
  do nothing
  returning id into v_inserted_id;

  -- The unique index is still the final guard.
  if v_inserted_id is null then
    select *
      into v_existing
    from public.distraction_events
    where user_id = v_user_id
      and extension_event_id = p_event_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'Concurrent event requires reconciliation';
    end if;

    if v_existing.session_id <> p_session_id
       or v_existing.extension_segment_id <> p_segment_id
       or v_existing.distraction_type::text <> p_category
       or v_existing.duration_seconds <> p_duration_seconds then
      raise exception using
        errcode = 'P0001',
        message = 'Idempotency payload mismatch';
    end if;

    return jsonb_build_object(
      'saved', true,
      'duplicate', true,
      'id', v_existing.id
    );
  end if;

  return jsonb_build_object(
    'saved', true,
    'duplicate', false,
    'id', v_inserted_id
  );
end;
$$;

revoke all on function
  public.extension_confirm_distraction(
    uuid, uuid, uuid, text, integer
  )
from public, anon, authenticated;

grant execute on function
  public.extension_confirm_distraction(
    uuid, uuid, uuid, text, integer
  )
to authenticated;

commit;
