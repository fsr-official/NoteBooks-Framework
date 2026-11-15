create table public.accounts (
  account_id text not null unique,
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null default 'user' check (role in ('admin', 'user')),
  updated_at timestamptz not null default now(),
  constraint accounts_account_id_format check (
    account_id = lower(account_id)
    and account_id ~ '^[a-z0-9][a-z0-9_-]{2,31}$'
  )
);

create unique index accounts_single_admin
  on public.accounts (role)
  where role = 'admin';

create table public.repository_entries (
  account_id text references public.accounts (account_id) on update cascade on delete restrict,
  archived_at timestamptz,
  branch text,
  class_or_stream text,
  created_at timestamptz not null default now(),
  file_name text,
  file_path text,
  file_sha text,
  id uuid primary key default gen_random_uuid(),
  last_commit_sha text,
  last_updated_at timestamptz,
  record_type text not null check (record_type in ('repository', 'file')),
  repo_id uuid references public.repository_entries (id) on delete cascade,
  repo_name text,
  repo_owner text,
  updated_at timestamptz not null default now(),
  constraint repository_entries_record_shape check (
    (
      record_type = 'repository'
      and account_id is not null
      and branch is not null
      and btrim(branch) <> ''
      and class_or_stream is not null
      and class_or_stream in ('classnine', 'classten', 'science', 'commerce', 'humanities', 'developer')
      and file_name is null
      and file_path is null
      and file_sha is null
      and repo_id is null
      and repo_name is not null
      and btrim(repo_name) <> ''
      and repo_owner is not null
      and btrim(repo_owner) <> ''
    )
    or
    (
      record_type = 'file'
      and account_id is null
      and archived_at is null
      and branch is null
      and class_or_stream is null
      and file_name is not null
      and file_name <> ''
      and file_path is not null
      and file_path <> ''
      and file_path !~ '(^/|(^|/)\.\.(/|$))'
      and file_sha is not null
      and file_sha <> ''
      and repo_id is not null
      and repo_name is null
      and repo_owner is null
      and last_commit_sha is null
      and last_updated_at is null
    )
  )
);

create unique index repository_entries_owner_name_unique
  on public.repository_entries (lower(repo_owner), lower(repo_name))
  where record_type = 'repository';

create unique index repository_entries_repo_path_unique
  on public.repository_entries (repo_id, file_path)
  where record_type = 'file';

create index repository_entries_repo_id_idx
  on public.repository_entries (repo_id)
  where record_type = 'file';

create function public.ensure_file_parent_is_repository()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_type text;
begin
  if new.record_type = 'file' then
    select record_type
      into parent_type
      from public.repository_entries
      where id = new.repo_id
      for key share;

    if parent_type is distinct from 'repository' then
      raise exception 'repo_id must reference a repository record';
    end if;
  end if;

  return new;
end;
$$;

create trigger repository_entries_validate_parent
  before insert or update of record_type, repo_id
  on public.repository_entries
  for each row execute function public.ensure_file_parent_is_repository();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger repository_entries_set_updated_at
  before update on public.repository_entries
  for each row execute function public.set_updated_at();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.accounts
      where auth_user_id = (select auth.uid())
        and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function public.create_account_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_account_id text;
begin
  requested_account_id := lower(trim(new.raw_user_meta_data ->> 'account_id'));

  if requested_account_id is null
    or requested_account_id !~ '^[a-z0-9][a-z0-9_-]{2,31}$'
  then
    raise exception 'A valid account_id is required';
  end if;

  insert into public.accounts (account_id, auth_user_id)
  values (requested_account_id, new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_account_for_auth_user();

alter table public.accounts enable row level security;
alter table public.repository_entries enable row level security;

create policy "Accounts can be read by their owner or the admin"
  on public.accounts
  for select
  to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Only the admin can manage accounts"
  on public.accounts
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Only the admin can read repository entries"
  on public.repository_entries
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Only the admin can insert repository entries"
  on public.repository_entries
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Only the admin can update repository entries"
  on public.repository_entries
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Only the admin can delete repository entries"
  on public.repository_entries
  for delete
  to authenticated
  using ((select public.is_admin()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.repository_entries to authenticated;

revoke all on public.accounts from anon;
revoke all on public.repository_entries from anon;
revoke all on function public.create_account_for_auth_user() from public, anon, authenticated;
revoke all on function public.ensure_file_parent_is_repository() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
