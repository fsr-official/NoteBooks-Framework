-- Replace the retired Documents repository with the current Developers repository.
delete from public.repository_entries
where record_type = 'repository'
  and lower(repo_owner) = 'fsr-official'
  and lower(repo_name) = 'notebooks-documents';

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
  'github-tree',
  null,
  now(),
  false,
  true,
  false,
  16,
  'repository',
  'NoteBooks-Developers',
  'NoteBooks-Developers',
  'fsr-official',
  ''
)
on conflict (lower(repo_owner), lower(repo_name))
  where record_type = 'repository'
do update set
  archived_at = null,
  branch = excluded.branch,
  class_or_stream = 'developer',
  empty = excluded.empty,
  enabled = true,
  fallback = excluded.fallback,
  last_updated_at = now(),
  lfs = false,
  mdx_styled_rendering = true,
  pages = false,
  priority = 16,
  registry_name = 'NoteBooks-Developers',
  root = '',
  updated_at = now();
