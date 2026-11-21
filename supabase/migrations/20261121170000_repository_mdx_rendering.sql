alter table public.repository_entries
  add column mdx_styled_rendering boolean not null default false;

alter table public.repository_entries
  add constraint repository_entries_mdx_styled_rendering_repository_only
  check (mdx_styled_rendering = false or record_type = 'repository');

update public.feature_flags
set enabled = true,
    updated_at = now()
where flag_name = 'mdx-rendering';

insert into public.repository_entries (
  account_id,
  archived_at,
  branch,
  class_or_stream,
  empty,
  enabled,
  fallback,
  last_commit_sha,
  last_updated_at,
  lfs,
  mdx_styled_rendering,
  pages,
  priority,
  record_type,
  registry_name,
  repo_name,
  repo_owner,
  root
)
values (
  null,
  null,
  'main',
  'developer',
  false,
  true,
  null,
  null,
  now(),
  false,
  true,
  false,
  null,
  'repository',
  'NoteBooks-Developers',
  'NoteBooks-Developers',
  'fsr-official',
  ''
)
on conflict (lower(repo_owner), lower(repo_name))
  where record_type = 'repository'
do update
  set mdx_styled_rendering = true,
      updated_at = now();
