begin;

alter table public.distraction_events
  add column extension_segment_id uuid
    references public.focus_session_segments(id);

alter table public.distraction_events
  add constraint chk_extension_distraction_identity
  check (
    (extension_event_id is null and extension_segment_id is null)
    or
    (extension_event_id is not null and extension_segment_id is not null)
  );

create or replace function public.protect_extension_distraction_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.extension_event_id is not null
     and new.extension_event_id is distinct from
         old.extension_event_id then
    raise exception using
      errcode = '23514',
      message = 'Extension event ID is immutable';
  end if;

  if old.extension_segment_id is not null
     and new.extension_segment_id is distinct from
         old.extension_segment_id then
    raise exception using
      errcode = '23514',
      message = 'Extension segment ID is immutable';
  end if;

  return new;
end;
$$;

commit;