alter type public.task_status
add value if not exists 'in_review' after 'in_progress';