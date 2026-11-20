create table public.feature_flags (
  enabled boolean not null default false,
  flag_name text primary key,
  updated_at timestamptz not null default now(),
  constraint feature_flags_name_format check (flag_name ~ '^[a-z][a-z0-9-]{0,79}$')
);

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from public, anon, authenticated;
grant select, insert, update, delete on public.feature_flags to service_role;

insert into public.feature_flags (flag_name, enabled)
values ('mdx-rendering', false);

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();
