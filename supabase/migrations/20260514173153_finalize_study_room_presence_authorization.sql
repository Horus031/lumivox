begin;

drop policy if exists
  "TEMP authenticated users can receive any private realtime"
on realtime.messages;

drop policy if exists
  "TEMP authenticated users can send any private realtime"
on realtime.messages;

drop policy if exists
  "TEMP authenticated users can receive presence"
on realtime.messages;

drop policy if exists
  "TEMP authenticated users can send presence"
on realtime.messages;

drop policy if exists
  "Study room members can receive room presence"
on realtime.messages;

drop policy if exists
  "Study room members can send room presence"
on realtime.messages;


create policy
  "Study room members can receive room presence"
on realtime.messages
for select
to authenticated
using (
  public.can_access_study_room_presence_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);

create policy
  "Study room members can send room presence"
on realtime.messages
for insert
to authenticated
with check (
  public.can_access_study_room_presence_topic(
    (select realtime.topic()),
    (select auth.uid())
  )
);

commit;