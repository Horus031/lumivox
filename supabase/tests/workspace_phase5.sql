begin;


-- ============================================================
-- Fixtures
-- ============================================================

insert into auth.users (
  id,
  email
)
values (
  '00000000-0000-4000-8000-000000000095',
  'workspace-phase5@example.test'
);


insert into public.profiles (
  id
)
values (
  '00000000-0000-4000-8000-000000000095'
)
on conflict (id)
do nothing;


insert into public.tasks (
  id,
  user_id,
  title,
  status
)
values (
  '00000000-0000-4000-8000-000000000596',
  '00000000-0000-4000-8000-000000000095',
  'Phase 5 review fixture',
  'in_progress'
);


insert into public.task_review_attempts (
  id,
  user_id,
  task_id,
  attempt_number,
  status,
  task_snapshot
)
values (
  '00000000-0000-4000-8000-000000000597',
  '00000000-0000-4000-8000-000000000095',
  '00000000-0000-4000-8000-000000000596',
  1,
  'generating',
  '{"task":{"title":"Fixture"}}'::jsonb
);


-- ============================================================
-- Privilege assertions
-- ============================================================

do $$
begin

  if not has_table_privilege(
    'authenticated',
    'public.task_review_attempts',
    'SELECT'
  ) then
    raise exception
      'authenticated must be able to read review attempts';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.task_review_attempts',
    'INSERT'
  ) then
    raise exception
      'authenticated must not insert review attempts';
  end if;


  if has_table_privilege(
    'authenticated',
    'public.task_review_answer_keys',
    'SELECT'
  ) then
    raise exception
      'authenticated must not read answer keys';
  end if;


  if has_function_privilege(
    'authenticated',
    'public.finalize_task_review_generation(uuid,uuid,uuid,public.task_status,timestamptz,jsonb,jsonb,jsonb,text,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated must not execute review finalization';
  end if;


  if not has_function_privilege(
    'service_role',
    'public.finalize_task_review_generation(uuid,uuid,uuid,public.task_status,timestamptz,jsonb,jsonb,jsonb,text,text,text,integer)',
    'EXECUTE'
  ) then
    raise exception
      'service_role must execute review finalization';
  end if;

end;
$$;


-- ============================================================
-- RLS: user may read own review attempt
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000095',
  true
);


do $$
declare
  v_count integer;
begin

  select count(*)
  into v_count
  from public.task_review_attempts
  where id =
    '00000000-0000-4000-8000-000000000597';

  if v_count <> 1 then
    raise exception
      'User cannot read own review attempt';
  end if;

end;
$$;


reset role;


-- ============================================================
-- Direct authenticated In Review transition must fail
-- ============================================================

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000095',
  true
);


do $$
begin

  begin

    update public.tasks
    set status = 'in_review'
    where id =
      '00000000-0000-4000-8000-000000000596';

    raise exception
      'Expected direct In Review mutation to fail';

  exception
    when others then
      if sqlerrm =
        'Expected direct In Review mutation to fail'
      then
        raise;
      end if;
  end;

end;
$$;


reset role;


rollback;