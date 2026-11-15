alter table public.repository_entries
  drop constraint repository_entries_record_shape;

update public.repository_entries
  set class_or_stream = 'lowersecondary'
  where record_type = 'repository'
    and class_or_stream in ('classnine', 'classten');

alter table public.repository_entries
  add constraint repository_entries_record_shape check (
    (
      record_type = 'repository'
      and branch is not null
      and btrim(branch) <> ''
      and class_or_stream is not null
      and class_or_stream in ('lowersecondary', 'science', 'commerce', 'humanities', 'developer')
      and enabled is not null
      and empty is not null
      and lfs is not null
      and pages is not null
      and root is not null
      and file_name is null
      and file_path is null
      and file_sha is null
      and repo_id is null
      and repo_name is not null
      and btrim(repo_name) <> ''
      and repo_owner is not null
      and btrim(repo_owner) <> ''
      and registry_name is not null
      and btrim(registry_name) <> ''
    )
    or
    (
      record_type = 'file'
      and account_id is null
      and archived_at is null
      and branch is null
      and class_or_stream is null
      and enabled is null
      and empty is null
      and fallback is null
      and file_name is not null
      and file_name <> ''
      and file_path is not null
      and file_path <> ''
      and file_path !~ '(^/|(^|/)\.\.(/|$))'
      and file_sha is not null
      and file_sha <> ''
      and lfs is null
      and last_commit_sha is null
      and last_updated_at is null
      and pages is null
      and priority is null
      and repo_id is not null
      and repo_name is null
      and repo_owner is null
      and registry_name is null
      and root is null
    )
  );

create or replace function public.sync_repository_catalog(p_repositories jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  repository_item jsonb;
  file_item jsonb;
  repository_id uuid;
  repository_owner text;
  repository_name text;
  repository_branch text;
  repository_group text;
  repository_commit_sha text;
  file_path_value text;
  file_name_value text;
  file_sha_value text;
  seen_paths text[];
  processed_count integer := 0;
begin
  if jsonb_typeof(p_repositories) is distinct from 'array' then
    raise exception 'Repository sync payload must be a JSON array';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_repositories) as item(value)
      group by lower(btrim(item.value ->> 'repo_owner')), lower(btrim(item.value ->> 'repo_name'))
      having count(*) > 1
  ) then
    raise exception 'Repository sync payload contains duplicate repositories';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(19483721, 1);

  for repository_item in
    select value from jsonb_array_elements(p_repositories)
  loop
    repository_owner := btrim(repository_item ->> 'repo_owner');
    repository_name := btrim(repository_item ->> 'repo_name');
    repository_branch := btrim(repository_item ->> 'branch');
    repository_group := lower(btrim(repository_item ->> 'class_or_stream'));
    repository_commit_sha := lower(nullif(btrim(repository_item ->> 'last_commit_sha'), ''));
    seen_paths := array[]::text[];

    if repository_owner is null or repository_owner = ''
      or repository_name is null or repository_name = ''
      or repository_branch is null or repository_branch = ''
      or nullif(btrim(repository_item ->> 'registry_name'), '') is null
    then
      raise exception 'Every repository requires owner, name, branch, and registry name';
    end if;
    if repository_group not in ('lowersecondary', 'science', 'commerce', 'humanities', 'developer') then
      raise exception 'Unsupported repository group: %', repository_group;
    end if;
    if repository_commit_sha is not null and repository_commit_sha !~ '^[a-f0-9]{40}$' then
      raise exception 'Invalid commit SHA for %/%', repository_owner, repository_name;
    end if;
    if jsonb_typeof(repository_item -> 'files') is distinct from 'array' then
      raise exception 'Files must be an array for %/%', repository_owner, repository_name;
    end if;

    select id
      into repository_id
      from public.repository_entries
      where record_type = 'repository'
        and lower(repo_owner) = lower(repository_owner)
        and lower(repo_name) = lower(repository_name)
      for update;

    if repository_id is null then
      insert into public.repository_entries (
        account_id,
        archived_at,
        branch,
        class_or_stream,
        enabled,
        empty,
        fallback,
        last_commit_sha,
        last_updated_at,
        lfs,
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
        repository_branch,
        repository_group,
        coalesce((repository_item ->> 'enabled')::boolean, true),
        coalesce((repository_item ->> 'empty')::boolean, false),
        nullif(lower(btrim(repository_item ->> 'fallback')), ''),
        repository_commit_sha,
        now(),
        coalesce((repository_item ->> 'lfs')::boolean, false),
        coalesce((repository_item ->> 'pages')::boolean, false),
        nullif(repository_item ->> 'priority', '')::integer,
        'repository',
        btrim(repository_item ->> 'registry_name'),
        repository_name,
        repository_owner,
        coalesce(repository_item ->> 'root', '')
      )
      returning id into repository_id;
    else
      update public.repository_entries
        set archived_at = null,
            branch = repository_branch,
            class_or_stream = repository_group,
            enabled = coalesce((repository_item ->> 'enabled')::boolean, true),
            empty = coalesce((repository_item ->> 'empty')::boolean, false),
            fallback = nullif(lower(btrim(repository_item ->> 'fallback')), ''),
            last_commit_sha = repository_commit_sha,
            last_updated_at = now(),
            lfs = coalesce((repository_item ->> 'lfs')::boolean, false),
            pages = coalesce((repository_item ->> 'pages')::boolean, false),
            priority = nullif(repository_item ->> 'priority', '')::integer,
            registry_name = btrim(repository_item ->> 'registry_name'),
            root = coalesce(repository_item ->> 'root', '')
        where id = repository_id;
    end if;

    for file_item in
      select value from jsonb_array_elements(repository_item -> 'files')
    loop
      file_path_value := replace(btrim(file_item ->> 'path'), E'\\', '/');
      file_name_value := btrim(file_item ->> 'name');
      file_sha_value := lower(btrim(file_item ->> 'sha'));

      if file_path_value = ''
        or file_path_value ~ '(^/|(^|/)\.\.(/|$))'
        or file_name_value = ''
        or file_sha_value !~ '^[a-f0-9]{40}$'
      then
        raise exception 'Invalid file entry for %/%: %', repository_owner, repository_name, file_path_value;
      end if;
      if file_path_value = any(seen_paths) then
        raise exception 'Duplicate file path for %/%: %', repository_owner, repository_name, file_path_value;
      end if;
      seen_paths := array_append(seen_paths, file_path_value);

      update public.repository_entries
        set file_name = file_name_value,
            file_sha = file_sha_value
        where record_type = 'file'
          and repo_id = repository_id
          and file_path = file_path_value;

      if not found then
        insert into public.repository_entries (
          file_name,
          file_path,
          file_sha,
          record_type,
          repo_id
        )
        values (
          file_name_value,
          file_path_value,
          file_sha_value,
          'file',
          repository_id
        );
      end if;
    end loop;

    delete from public.repository_entries as stored_file
      where stored_file.record_type = 'file'
        and stored_file.repo_id = repository_id
        and not exists (
          select 1
            from jsonb_array_elements(repository_item -> 'files') as incoming_file(value)
            where replace(btrim(incoming_file.value ->> 'path'), E'\\', '/') = stored_file.file_path
        );

    update public.repository_entries
      set last_updated_at = now()
      where id = repository_id;

    processed_count := processed_count + 1;
    repository_id := null;
  end loop;

  return processed_count;
end;
$$;

revoke all on function public.sync_repository_catalog(jsonb) from public, anon, authenticated;
grant execute on function public.sync_repository_catalog(jsonb) to service_role;
