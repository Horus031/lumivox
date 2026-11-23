-- Local development login. Keep this fixture out of hosted databases.
do $seed$
declare
  dev_user_id constant uuid := 'a2bc883d-4f70-4915-9e16-41194a7ce706';
  dev_email constant text := 'workspace-dev@example.test';
  dev_password constant text := 'Lumivox-Local-Dev!2026';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    dev_user_id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', dev_email,
    extensions.crypt(dev_password, extensions.gen_salt('bf')), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Lumivox Local Dev"}'::jsonb,
    now(), now()
  )
  on conflict (id) do nothing;

  if not exists (select 1 from auth.users where id = dev_user_id and email = dev_email) then
    raise exception 'Seed account ID is already used by a different Auth user';
  end if;

  insert into auth.identities (
    user_id, provider_id, provider, identity_data, created_at, updated_at
  )
  values (
    dev_user_id, dev_user_id::text, 'email',
    jsonb_build_object('sub', dev_user_id::text, 'email', dev_email, 'email_verified', true),
    now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  update public.profiles
  set onboarding_completed = true
  where id = dev_user_id and not onboarding_completed;
end;
$seed$;
