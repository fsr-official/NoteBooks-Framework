alter table public.accounts
  add column github_user_id text,
  add column github_username text,
  add column user_name text;

update public.accounts
  set user_name = coalesce(nullif(btrim(github_username), ''), account_id);

alter table public.accounts
  alter column user_name set not null,
  add constraint accounts_user_name_format check (
    char_length(btrim(user_name)) between 1 and 40
  );

create unique index accounts_github_user_id_unique
  on public.accounts (github_user_id)
  where github_user_id is not null;

create function public.prevent_account_id_change_after_setup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is distinct from old.account_id
    and old.account_id !~ '^user-[a-f0-9]{12}$'
  then
    raise exception 'User ID cannot be changed after account setup';
  end if;

  return new;
end;
$$;

create trigger accounts_account_id_immutable
  before update of account_id on public.accounts
  for each row execute function public.prevent_account_id_change_after_setup();

revoke all on function public.prevent_account_id_change_after_setup() from public, anon, authenticated;

create or replace function public.create_account_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_account_id text;
  requested_user_name text;
begin
  requested_account_id := lower(trim(new.raw_user_meta_data ->> 'account_id'));

  if requested_account_id is null or requested_account_id = '' then
    requested_account_id := 'user-' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  if requested_account_id !~ '^[a-z0-9][a-z0-9_-]{2,31}$' then
    raise exception 'A valid account_id is required';
  end if;

  requested_user_name := nullif(btrim(new.raw_user_meta_data ->> 'user_name'), '');
  if requested_user_name is null then
    requested_user_name := requested_account_id;
  end if;
  if char_length(requested_user_name) not between 1 and 40 then
    raise exception 'A valid user_name is required';
  end if;

  insert into public.accounts (account_id, auth_user_id, user_name)
  values (requested_account_id, new.id, requested_user_name);

  return new;
end;
$$;

revoke all on function public.create_account_for_auth_user() from public, anon, authenticated;

create table public.account_sessions (
  session_id uuid primary key,
  auth_user_id uuid not null references public.accounts (auth_user_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_sessions_auth_user_id_idx
  on public.account_sessions (auth_user_id);

create trigger account_sessions_set_updated_at
  before update on public.account_sessions
  for each row execute function public.set_updated_at();

alter table public.account_sessions enable row level security;
revoke all on public.account_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.account_sessions to service_role;
