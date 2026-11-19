create table public.ai_provider_key_controls (
  cooldown_until timestamptz,
  enabled boolean not null default true,
  key_slot text primary key check (
    key_slot in ('main', 'science', 'commerce', 'humanities', 'lower-secondary')
  ),
  last_rate_limited_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text references public.accounts (account_id) on update cascade on delete set null
);

insert into public.ai_provider_key_controls (key_slot)
values ('main'), ('science'), ('commerce'), ('humanities'), ('lower-secondary')
on conflict (key_slot) do nothing;

alter table public.ai_provider_key_controls enable row level security;
revoke all on public.ai_provider_key_controls from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_key_controls to service_role;

create table public.ai_provider_key_metrics (
  bucket timestamptz not null,
  completion_tokens bigint not null default 0 check (completion_tokens >= 0),
  key_slot text not null check (
    key_slot in ('main', 'science', 'commerce', 'humanities', 'lower-secondary')
  ),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  rate_limited_count bigint not null default 0 check (rate_limited_count >= 0),
  request_count bigint not null default 0 check (request_count >= 0),
  primary key (bucket, key_slot)
);

create index ai_provider_key_metrics_bucket_idx
  on public.ai_provider_key_metrics (bucket desc);

alter table public.ai_provider_key_metrics enable row level security;
revoke all on public.ai_provider_key_metrics from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_key_metrics to service_role;

create function public.get_active_ai_provider_key_slots()
returns table (key_slot text)
language sql
stable
security definer
set search_path = ''
as $$
  select controls.key_slot
    from public.ai_provider_key_controls as controls
   where controls.enabled
     and (controls.cooldown_until is null or controls.cooldown_until <= now())
   order by controls.key_slot;
$$;

revoke all on function public.get_active_ai_provider_key_slots() from public, anon, authenticated;
grant execute on function public.get_active_ai_provider_key_slots() to service_role;

create function public.record_ai_provider_key_usage(
  p_key_slot text,
  p_prompt_tokens integer,
  p_completion_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key_slot is null
    or p_key_slot not in ('main', 'science', 'commerce', 'humanities', 'lower-secondary')
    or p_prompt_tokens is null or p_prompt_tokens < 0
    or p_completion_tokens is null or p_completion_tokens < 0
  then
    raise exception 'Invalid AI provider usage metric';
  end if;

  if date_part('minute', now()) = 0 and pg_catalog.pg_try_advisory_xact_lock(19483721, 3) then
    delete from public.ai_provider_key_metrics where bucket < now() - interval '30 days';
  end if;

  insert into public.ai_provider_key_metrics (
    bucket, completion_tokens, key_slot, prompt_tokens, request_count
  )
  values (
    date_trunc('minute', now()),
    p_completion_tokens,
    p_key_slot,
    p_prompt_tokens,
    1
  )
  on conflict (bucket, key_slot) do update
    set completion_tokens = public.ai_provider_key_metrics.completion_tokens + excluded.completion_tokens,
        prompt_tokens = public.ai_provider_key_metrics.prompt_tokens + excluded.prompt_tokens,
        request_count = public.ai_provider_key_metrics.request_count + 1;
end;
$$;

revoke all on function public.record_ai_provider_key_usage(text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_ai_provider_key_usage(text, integer, integer) to service_role;

create function public.record_ai_provider_key_rate_limit(
  p_key_slot text,
  p_retry_after_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key_slot is null
    or p_key_slot not in ('main', 'science', 'commerce', 'humanities', 'lower-secondary')
    or p_retry_after_seconds is null or p_retry_after_seconds not between 1 and 3600
  then
    raise exception 'Invalid AI provider rate-limit state';
  end if;

  update public.ai_provider_key_controls
     set cooldown_until = greatest(
           coalesce(cooldown_until, now()),
           now() + pg_catalog.make_interval(secs => p_retry_after_seconds)
         ),
         last_rate_limited_at = now(),
         updated_at = now()
   where key_slot = p_key_slot;

  insert into public.ai_provider_key_metrics (bucket, key_slot, rate_limited_count)
  values (date_trunc('minute', now()), p_key_slot, 1)
  on conflict (bucket, key_slot) do update
    set rate_limited_count = public.ai_provider_key_metrics.rate_limited_count + 1;
end;
$$;

revoke all on function public.record_ai_provider_key_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.record_ai_provider_key_rate_limit(text, integer) to service_role;

create function public.set_ai_provider_key_enabled(
  p_key_slot text,
  p_enabled boolean,
  p_updated_by text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key_slot is null
    or p_key_slot not in ('main', 'science', 'commerce', 'humanities', 'lower-secondary')
    or p_enabled is null
    or p_updated_by is null
  then
    raise exception 'Invalid AI provider key control';
  end if;

  update public.ai_provider_key_controls
     set enabled = p_enabled,
         cooldown_until = case when p_enabled then null else cooldown_until end,
         updated_at = now(),
         updated_by = p_updated_by
   where key_slot = p_key_slot;

  if not found then
    raise exception 'AI provider key slot not found';
  end if;
end;
$$;

revoke all on function public.set_ai_provider_key_enabled(text, boolean, text) from public, anon, authenticated;
grant execute on function public.set_ai_provider_key_enabled(text, boolean, text) to service_role;

create function public.get_ai_provider_key_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'keySlot', controls.key_slot,
    'enabled', controls.enabled,
    'cooldownUntil', controls.cooldown_until,
    'lastRateLimitedAt', controls.last_rate_limited_at,
    'requests24h', coalesce(metrics.requests_24h, 0),
    'promptTokens24h', coalesce(metrics.prompt_tokens_24h, 0),
    'completionTokens24h', coalesce(metrics.completion_tokens_24h, 0),
    'rateLimited24h', coalesce(metrics.rate_limited_24h, 0),
    'requests30d', coalesce(metrics.requests_30d, 0),
    'promptTokens30d', coalesce(metrics.prompt_tokens_30d, 0),
    'completionTokens30d', coalesce(metrics.completion_tokens_30d, 0)
  ) order by controls.key_slot), '[]'::jsonb)
    from public.ai_provider_key_controls as controls
    left join lateral (
      select
        coalesce(sum(metric.request_count) filter (
          where metric.bucket >= now() - interval '24 hours'
        ), 0)::bigint as requests_24h,
        coalesce(sum(metric.prompt_tokens) filter (
          where metric.bucket >= now() - interval '24 hours'
        ), 0)::bigint as prompt_tokens_24h,
        coalesce(sum(metric.completion_tokens) filter (
          where metric.bucket >= now() - interval '24 hours'
        ), 0)::bigint as completion_tokens_24h,
        coalesce(sum(metric.rate_limited_count) filter (
          where metric.bucket >= now() - interval '24 hours'
        ), 0)::bigint as rate_limited_24h,
        coalesce(sum(metric.request_count), 0)::bigint as requests_30d,
        coalesce(sum(metric.prompt_tokens), 0)::bigint as prompt_tokens_30d,
        coalesce(sum(metric.completion_tokens), 0)::bigint as completion_tokens_30d
        from public.ai_provider_key_metrics as metric
       where metric.key_slot = controls.key_slot
         and metric.bucket >= now() - interval '30 days'
    ) as metrics on true;
$$;

revoke all on function public.get_ai_provider_key_dashboard() from public, anon, authenticated;
grant execute on function public.get_ai_provider_key_dashboard() to service_role;
