begin;

create extension if not exists pgtap
  with schema extensions;

set local search_path = public, extensions;

select plan(5);

select has_function(
  'public',
  'extension_confirm_distraction',
  array['uuid', 'uuid', 'uuid', 'text', 'integer'],
  'Atomic confirmation RPC exists'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid =
      'public.extension_confirm_distraction(uuid,uuid,uuid,text,integer)'::regprocedure
  ),
  'Atomic RPC is SECURITY DEFINER'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.extension_confirm_distraction(uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'Authenticated role may call the RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.extension_confirm_distraction(uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'Anonymous role cannot call the RPC'
);

select ok(
  -- PUBLIC is a pseudo-role (ACL grantee 0), not a named database role.
  not exists (
    select 1
    from pg_proc as p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) as acl
    where p.oid =
      'public.extension_confirm_distraction(uuid,uuid,uuid,text,integer)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC is not granted EXECUTE'
);

select * from finish();

rollback;
