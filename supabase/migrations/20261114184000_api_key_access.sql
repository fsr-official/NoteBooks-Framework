create table public.api_keys (
  account_id text not null references public.accounts (account_id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique check (key_hash ~ '^[a-f0-9]{64}$'),
  key_prefix text not null,
  last_used_at timestamptz,
  name text not null check (char_length(btrim(name)) between 1 and 64),
  revoked_at timestamptz
);

create index api_keys_account_created_idx
  on public.api_keys (account_id, created_at desc);

alter table public.api_keys enable row level security;
revoke all on public.api_keys from public, anon, authenticated;
grant select, insert, update, delete on public.api_keys to service_role;

create function public.create_api_key(
  p_auth_user_id uuid,
  p_name text,
  p_key_hash text,
  p_key_prefix text
)
returns table (
  api_key_id uuid,
  account_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owning_account_id text;
  active_key_count integer;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 64 then
    raise exception 'API_KEY_NAME_INVALID';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'API_KEY_HASH_INVALID';
  end if;
  if p_key_prefix is null or char_length(p_key_prefix) not between 1 and 24 then
    raise exception 'API_KEY_PREFIX_INVALID';
  end if;

  select account.account_id
    into owning_account_id
    from public.accounts as account
    where account.auth_user_id = p_auth_user_id
    for update;

  if owning_account_id is null then
    raise exception 'ACCOUNT_REQUIRED';
  end if;

  select count(*)::integer
    into active_key_count
    from public.api_keys as api_key
    where api_key.account_id = owning_account_id
      and api_key.revoked_at is null
      and (api_key.expires_at is null or api_key.expires_at > now());

  if active_key_count >= 5 then
    raise exception 'API_KEY_LIMIT_REACHED';
  end if;

  return query
    insert into public.api_keys as created_key (account_id, key_hash, key_prefix, name)
    values (owning_account_id, p_key_hash, p_key_prefix, btrim(p_name))
    returning created_key.id, created_key.account_id, created_key.created_at;
end;
$$;

revoke all on function public.create_api_key(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_api_key(uuid, text, text, text) to service_role;

create function public.get_public_file_download(
  p_repo_owner text,
  p_repo_name text,
  p_file_path text
)
returns table (
  repo_owner text,
  repo_name text,
  branch text,
  last_commit_sha text,
  file_path text,
  file_sha text
)
language sql
stable
security definer
set search_path = ''
as $$
  select repository.repo_owner,
         repository.repo_name,
         repository.branch,
         repository.last_commit_sha,
         file.file_path,
         file.file_sha
    from public.repository_entries as file
    join public.repository_entries as repository
      on repository.id = file.repo_id
     and repository.record_type = 'repository'
    where file.record_type = 'file'
      and lower(repository.repo_owner) = lower(p_repo_owner)
      and lower(repository.repo_name) = lower(p_repo_name)
      and file.file_path = p_file_path
      and repository.enabled
      and repository.archived_at is null
    limit 1;
$$;

revoke all on function public.get_public_file_download(text, text, text) from public, anon, authenticated;
grant execute on function public.get_public_file_download(text, text, text) to service_role;
