create or replace function public.create_account_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_account_id text;
begin
  requested_account_id := lower(trim(new.raw_user_meta_data ->> 'account_id'));

  if requested_account_id is null or requested_account_id = '' then
    requested_account_id := 'user-' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  if requested_account_id !~ '^[a-z0-9][a-z0-9_-]{2,31}$' then
    raise exception 'A valid account_id is required';
  end if;

  insert into public.accounts (account_id, auth_user_id)
  values (requested_account_id, new.id);

  return new;
end;
$$;

revoke all on function public.create_account_for_auth_user() from public, anon, authenticated;
