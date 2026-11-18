create table public.ai_usage_events (
  account_id text not null references public.accounts (account_id) on update cascade on delete cascade,
  completion_tokens integer not null check (completion_tokens >= 0),
  created_at timestamptz not null default now(),
  id bigint generated always as identity primary key,
  key_slot text not null check (key_slot in ('main', 'science', 'commerce', 'humanities', 'lower-secondary')),
  model text not null,
  prompt_tokens integer not null check (prompt_tokens >= 0),
  request_id uuid not null unique
);

create index ai_usage_events_account_created_at_idx
  on public.ai_usage_events (account_id, created_at desc);

alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from public, anon, authenticated;
grant select, insert on public.ai_usage_events to service_role;
grant usage, select on sequence public.ai_usage_events_id_seq to service_role;

create function public.get_ai_usage_summary(p_account_id text)
returns table (
  month_requests bigint,
  month_prompt_tokens bigint,
  month_completion_tokens bigint,
  all_time_requests bigint,
  all_time_prompt_tokens bigint,
  all_time_completion_tokens bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    count(*) filter (
      where usage.created_at >= (
        date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      )
    ),
    coalesce(sum(usage.prompt_tokens) filter (
      where usage.created_at >= (
        date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      )
    ), 0)::bigint,
    coalesce(sum(usage.completion_tokens) filter (
      where usage.created_at >= (
        date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      )
    ), 0)::bigint,
    count(*),
    coalesce(sum(usage.prompt_tokens), 0)::bigint,
    coalesce(sum(usage.completion_tokens), 0)::bigint
  from public.ai_usage_events as usage
  where usage.account_id = p_account_id;
$$;

revoke all on function public.get_ai_usage_summary(text) from public, anon, authenticated;
grant execute on function public.get_ai_usage_summary(text) to service_role;
