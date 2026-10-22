
begin;

alter table public.distraction_events
  add column extension_event_id uuid;

create unique index
  uq_distraction_events_user_extension_event
on public.distraction_events (
  user_id,
  extension_event_id
)
where extension_event_id is not null;

-- Once an extension-origin event has been persisted,
-- do not allow its deduplication key to be rewritten.
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

  return new;
end;
$$;

revoke all on function
  public.protect_extension_distraction_key()
from public, anon, authenticated;

create trigger protect_extension_distraction_key
before update on public.distraction_events
for each row
execute function public.protect_extension_distraction_key();

commit;
