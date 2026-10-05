begin;

-- ============================================================
-- 1. A learning document belongs to exactly one context
--    Goal XOR Task
-- ============================================================

alter table public.learning_documents
drop constraint if exists learning_document_goal_or_task_required;

alter table public.learning_documents
add constraint learning_document_exactly_one_context
check (
  num_nonnulls(goal_id, task_id) = 1
);


-- ============================================================
-- 2. INSERT policy
--    Owner must own the linked goal/task.
-- ============================================================

drop policy if exists "Users can insert their own learning documents"
on public.learning_documents;

create policy "Users can insert their own learning documents"
on public.learning_documents
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    (
      goal_id is not null
      and task_id is null
      and exists (
        select 1
        from public.goals goal
        where goal.id = learning_documents.goal_id
          and goal.user_id = (select auth.uid())
      )
    )
    or
    (
      task_id is not null
      and goal_id is null
      and exists (
        select 1
        from public.tasks task
        where task.id = learning_documents.task_id
          and task.user_id = (select auth.uid())
      )
    )
  )
);


-- ============================================================
-- 3. UPDATE policy
--    Prevent an owner from relinking a document to someone
--    else's goal/task.
-- ============================================================

drop policy if exists "Owners can update their own learning documents"
on public.learning_documents;

create policy "Owners can update their own learning documents"
on public.learning_documents
for update
to authenticated
using (
  owner_id = (select auth.uid())
)
with check (
  owner_id = (select auth.uid())
  and (
    (
      goal_id is not null
      and task_id is null
      and exists (
        select 1
        from public.goals goal
        where goal.id = learning_documents.goal_id
          and goal.user_id = (select auth.uid())
      )
    )
    or
    (
      task_id is not null
      and goal_id is null
      and exists (
        select 1
        from public.tasks task
        where task.id = learning_documents.task_id
          and task.user_id = (select auth.uid())
      )
    )
  )
);

commit;