begin;

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
on table
  public.learning_roadmaps,
  public.learning_roadmap_nodes
to authenticated;

grant select, insert, update
on table
  public.study_group_weekly_challenges,
  public.ai_content_translations,
  public.cms_settings
to authenticated;

grant select, insert, update, delete
on all tables in schema public
to service_role;

grant usage, select
on all sequences in schema public
to service_role;

grant execute
on all functions in schema public
to service_role;

commit;
