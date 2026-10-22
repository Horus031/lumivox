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
  not has_function_privilege(
    'PUBLIC',
    'public.extension_confirm_distraction(uuid,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'PUBLIC does not inherit EXECUTE'
);

select * from finish();

rollback;
