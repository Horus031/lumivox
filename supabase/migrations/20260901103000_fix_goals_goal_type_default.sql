begin;

alter table public.goals
alter column goal_type set default 'short_term';

commit;
