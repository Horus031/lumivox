begin;

create index if not exists idx_task_review_attempts_user_completed
on public.task_review_attempts(
  user_id,
  completed_at desc
)
where status in (
  'passed'::public.task_review_attempt_status,
  'failed'::public.task_review_attempt_status
)
and completed_at is not null;

commit;