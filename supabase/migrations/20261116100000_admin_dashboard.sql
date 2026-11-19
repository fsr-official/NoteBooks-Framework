alter table public.repository_entries
  add column last_checked_at timestamptz,
  alter column account_id drop not null,
  drop constraint repository_entries_record_shape;

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
      and last_checked_at is null
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

create table public.api_request_metrics (
  bucket timestamptz not null,
  error_count bigint not null default 0,
  max_duration_ms integer not null default 0,
  method text not null,
  request_count bigint not null default 0,
  route text not null,
  total_duration_ms bigint not null default 0,
  primary key (bucket, method, route),
  constraint api_request_metrics_method check (method in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS')),
  constraint api_request_metrics_nonnegative check (
    error_count >= 0 and max_duration_ms >= 0 and request_count >= 0 and total_duration_ms >= 0
  )
);

create index api_request_metrics_bucket_idx
  on public.api_request_metrics (bucket desc);

create table public.website_page_metrics (
  bucket timestamptz not null,
  route text not null,
  view_count bigint not null default 0 check (view_count >= 0),
  primary key (bucket, route),
  constraint website_page_metrics_route check (
    route in ('/', '/lowersecondary', '/science', '/commerce', '/humanities', '/developers')
  )
);

create function public.prune_admin_metrics()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if date_part('minute', now()) = 0 and pg_catalog.pg_try_advisory_xact_lock(19483721, 2) then
    delete from public.api_request_metrics where bucket < now() - interval '30 days';
    delete from public.website_page_metrics where bucket < now() - interval '30 days';
  end if;
end;
$$;

revoke all on function public.prune_admin_metrics() from public, anon, authenticated;
grant execute on function public.prune_admin_metrics() to service_role;

alter table public.website_page_metrics enable row level security;
revoke all on public.website_page_metrics from public, anon, authenticated;
grant select, insert, update, delete on public.website_page_metrics to service_role;

create function public.record_website_page_view(p_route text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.prune_admin_metrics();

  if p_route is null or p_route not in ('/', '/lowersecondary', '/science', '/commerce', '/humanities', '/developers') then
    raise exception 'Invalid website page route';
  end if;

  insert into public.website_page_metrics (bucket, route, view_count)
  values (date_trunc('minute', now()), p_route, 1)
  on conflict (bucket, route) do update
    set view_count = public.website_page_metrics.view_count + 1;
end;
$$;

revoke all on function public.record_website_page_view(text) from public, anon, authenticated;
grant execute on function public.record_website_page_view(text) to service_role;

alter table public.api_request_metrics enable row level security;
revoke all on public.api_request_metrics from public, anon, authenticated;
grant select, insert, update, delete on public.api_request_metrics to service_role;

create function public.record_api_request_metric(
  p_route text,
  p_method text,
  p_status integer,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_bucket timestamptz := date_trunc('minute', now());
begin
  perform public.prune_admin_metrics();

  if p_route is null or p_route !~ '^/api/[A-Za-z0-9_./:-]{1,180}$'
    or p_method not in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS')
    or p_status < 100 or p_status > 599
    or p_duration_ms < 0 or p_duration_ms > 600000
  then
    raise exception 'Invalid API request metric';
  end if;

  insert into public.api_request_metrics (
    bucket, error_count, max_duration_ms, method, request_count, route, total_duration_ms
  )
  values (
    request_bucket,
    case when p_status >= 500 then 1 else 0 end,
    p_duration_ms,
    p_method,
    1,
    p_route,
    p_duration_ms
  )
  on conflict (bucket, method, route) do update
    set error_count = public.api_request_metrics.error_count + excluded.error_count,
        max_duration_ms = greatest(public.api_request_metrics.max_duration_ms, excluded.max_duration_ms),
        request_count = public.api_request_metrics.request_count + 1,
        total_duration_ms = public.api_request_metrics.total_duration_ms + excluded.total_duration_ms;
end;
$$;

revoke all on function public.record_api_request_metric(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_api_request_metric(text, text, integer, integer) to service_role;

create table public.admin_audit_events (
  account_id text not null references public.accounts (account_id) on update cascade on delete restrict,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  created_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  id bigint generated always as identity primary key,
  resource text not null check (char_length(resource) <= 200)
);

create index admin_audit_events_created_at_idx
  on public.admin_audit_events (created_at desc);

alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from public, anon, authenticated;
grant select, insert, delete on public.admin_audit_events to service_role;

create function public.prune_admin_audit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oldest_kept_id bigint;
begin
  select id
    into oldest_kept_id
    from public.admin_audit_events
   order by id desc
   offset 9999
   limit 1;
  if oldest_kept_id is not null then
    delete from public.admin_audit_events where id < oldest_kept_id;
  end if;
  return null;
end;
$$;

revoke all on function public.prune_admin_audit_events() from public, anon, authenticated;
grant execute on function public.prune_admin_audit_events() to service_role;

create trigger admin_audit_events_prune
  after insert on public.admin_audit_events
  for each statement execute function public.prune_admin_audit_events();

create table public.repository_sync_runs (
  branch text not null,
  commit_sha text,
  completed_at timestamptz,
  duration_ms integer,
  error_code text,
  file_count integer,
  id bigint generated always as identity primary key,
  repo_name text not null,
  repo_owner text not null,
  requested_by text references public.accounts (account_id) on update cascade on delete set null,
  started_at timestamptz not null default now(),
  status text not null check (status in ('running', 'updated', 'unchanged', 'ignored', 'failed')),
  constraint repository_sync_runs_duration check (duration_ms is null or duration_ms >= 0),
  constraint repository_sync_runs_file_count check (file_count is null or file_count >= 0),
  constraint repository_sync_runs_commit check (commit_sha is null or commit_sha ~ '^[a-f0-9]{40}$'),
  constraint repository_sync_runs_error_code check (error_code is null or error_code ~ '^[a-z][a-z0-9_-]{0,79}$')
);

create index repository_sync_runs_started_at_idx
  on public.repository_sync_runs (started_at desc);

alter table public.repository_sync_runs enable row level security;
revoke all on public.repository_sync_runs from public, anon, authenticated;
grant select, insert, update, delete on public.repository_sync_runs to service_role;

create function public.prune_repository_sync_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.repository_sync_runs
   where id in (
     select id
       from public.repository_sync_runs
      order by started_at desc, id desc
      offset 9999
   );
  return null;
end;
$$;

revoke all on function public.prune_repository_sync_runs() from public, anon, authenticated;
grant execute on function public.prune_repository_sync_runs() to service_role;

create trigger repository_sync_runs_prune
  after insert on public.repository_sync_runs
  for each statement execute function public.prune_repository_sync_runs();

create function public.get_admin_dashboard_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with repositories as (
    select repository.*,
           (
             select count(*)::bigint
               from public.repository_entries as file
              where file.record_type = 'file'
                and file.repo_id = repository.id
           ) as file_count,
           (
             select count(*)::bigint
               from public.repository_entries as file
              where file.record_type = 'file'
                and file.repo_id = repository.id
                and file.file_sha !~ '^[a-f0-9]{40}$'
           ) as invalid_file_sha_count
      from public.repository_entries as repository
     where repository.record_type = 'repository'
  ),
  active_files as (
    select file.*
      from public.repository_entries as file
      join repositories as repository on repository.id = file.repo_id
     where file.record_type = 'file'
       and repository.enabled
       and repository.archived_at is null
  ),
  traffic as (
    select coalesce(sum(request_count), 0)::bigint as request_count,
           coalesce(sum(error_count), 0)::bigint as error_count,
           coalesce(sum(total_duration_ms), 0)::bigint as total_duration_ms,
           coalesce(max(max_duration_ms), 0)::integer as max_duration_ms
      from public.api_request_metrics
     where bucket >= now() - interval '24 hours'
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'totalRepositories', (select count(*)::bigint from repositories),
      'enabledRepositories', (select count(*)::bigint from repositories where enabled and archived_at is null),
      'disabledRepositories', (select count(*)::bigint from repositories where not enabled and archived_at is null),
      'archivedRepositories', (select count(*)::bigint from repositories where archived_at is not null),
      'totalFiles', (select count(*)::bigint from public.repository_entries where record_type = 'file'),
      'activeFiles', (select count(*)::bigint from active_files),
      'invalidFileShas', (select count(*)::bigint from active_files where file_sha !~ '^[a-f0-9]{40}$'),
      'repositoriesWithoutCommit', (
        select count(*)::bigint from repositories
         where enabled and archived_at is null
           and (last_commit_sha is null or last_commit_sha !~ '^[a-f0-9]{40}$')
      ),
      'staleRepositories', (
        select count(*)::bigint from repositories
         where enabled and archived_at is null
             and (last_checked_at is null or last_checked_at < now() - interval '7 days')
      ),
      'requests24h', (select request_count from traffic),
      'pageViews24h', (
        select coalesce(sum(view_count), 0)::bigint
          from public.website_page_metrics
         where bucket >= now() - interval '24 hours'
      ),
      'errors24h', (select error_count from traffic),
      'averageDurationMs24h', (
        select case when request_count = 0 then 0
                    else round(total_duration_ms::numeric / request_count)::integer end
          from traffic
      ),
      'maxDurationMs24h', (select max_duration_ms from traffic)
    ),
    'repositories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', account_id,
        'id', id,
        'registry_name', registry_name,
        'repo_owner', repo_owner,
        'repo_name', repo_name,
        'branch', branch,
        'class_or_stream', class_or_stream,
        'enabled', enabled,
        'archived_at', archived_at,
        'last_commit_sha', last_commit_sha,
          'last_checked_at', last_checked_at,
          'last_updated_at', last_updated_at,
        'root', root,
        'empty', empty,
        'lfs', lfs,
        'pages', pages,
        'fallback', fallback,
        'priority', priority,
        'file_count', file_count,
        'invalid_file_sha_count', invalid_file_sha_count
      ) order by lower(repo_owner), lower(repo_name))
        from repositories
    ), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('account_id', account_id, 'role', role) order by account_id)
        from public.accounts
    ), '[]'::jsonb),
    'apiMetrics24h', coalesce((
      select jsonb_agg(jsonb_build_object(
        'route', route,
        'method', method,
        'requests', request_count,
        'errors', error_count,
        'averageDurationMs', case when request_count = 0 then 0
                                  else round(total_duration_ms::numeric / request_count)::integer end,
        'maxDurationMs', max_duration_ms
      ) order by request_count desc, route, method)
        from (
          select route,
                 method,
                 sum(request_count)::bigint as request_count,
                 sum(error_count)::bigint as error_count,
                 sum(total_duration_ms)::bigint as total_duration_ms,
                 max(max_duration_ms)::integer as max_duration_ms
            from public.api_request_metrics
           where bucket >= now() - interval '24 hours'
           group by route, method
        ) as route_metrics
    ), '[]'::jsonb),
    'pageTraffic24h', coalesce((
      select jsonb_agg(jsonb_build_object('route', route, 'views', view_count) order by view_count desc, route)
        from (
          select route, sum(view_count)::bigint as view_count
            from public.website_page_metrics
           where bucket >= now() - interval '24 hours'
           group by route
        ) as page_metrics
    ), '[]'::jsonb),
    'recentEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'created_at', created_at,
        'account_id', account_id,
        'action', action,
        'resource', resource,
        'details', details
      ) order by created_at desc)
        from (
          select id, created_at, account_id, action, resource, details
            from public.admin_audit_events
           order by created_at desc
           limit 100
        ) as recent_events
    ), '[]'::jsonb),
    'recentSyncRuns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'repo_owner', repo_owner,
        'repo_name', repo_name,
        'branch', branch,
        'status', status,
        'started_at', started_at,
        'completed_at', completed_at,
        'duration_ms', duration_ms,
        'commit_sha', commit_sha,
        'file_count', file_count,
        'error_code', error_code,
        'requested_by', requested_by
      ) order by started_at desc, id desc)
        from (
          select id, repo_owner, repo_name, branch, status, started_at, completed_at,
                 duration_ms, commit_sha, file_count, error_code, requested_by
            from public.repository_sync_runs
           order by started_at desc, id desc
           limit 100
        ) as recent_sync_runs
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_dashboard_snapshot() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_snapshot() to service_role;
