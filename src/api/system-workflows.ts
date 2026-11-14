import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { getOctokit, getStreamRepo } from './_shared.js';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { recordSystemEvent } from '../lib/system-events.js';

const MAX_JOBS_PER_RUN = 10;
const MAX_ATTEMPTS = 8;
const MAX_ISSUE_PAGES = 3;
const DISCUSSION_MARKER = (id: number) => `<!-- notebooksCommunityPostId:${id} -->`;
const PROPOSAL_MARKER = (id: number) => `noteBooksProposalId: ${id}`;

type WorkflowJob = {
  id: number;
  job_type: 'community_post' | 'issue_proposal';
  source_id: number;
  target_repository: string;
  attempts: number;
};

function validDate(value: unknown): Date | null {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function recordUptimeObservation(body: any) {
  if (!body || !['up', 'degraded', 'down'].includes(body.status)) {
    throw new Error('A valid uptime status is required');
  }
  const checkedAt = validDate(body.checkedAt);
  if (!checkedAt || checkedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new Error('A valid uptime check time is required');
  }
  const responseMs = body.responseMs == null ? null : Number(body.responseMs);
  if (responseMs !== null && (!Number.isSafeInteger(responseMs) || responseMs < 0 || responseMs > 600_000)) {
    throw new Error('Invalid uptime response time');
  }
  const previousNonUpStatus = body.previousNonUpStatus == null ? null : String(body.previousNonUpStatus);
  if (previousNonUpStatus !== null && !['degraded', 'down'].includes(previousNonUpStatus)) {
    throw new Error('Invalid previous service status');
  }
  const previousNonUpSince = body.previousNonUpSince ? validDate(body.previousNonUpSince) : null;
  if (body.previousNonUpSince && (!previousNonUpSince || previousNonUpSince > checkedAt)) {
    throw new Error('Invalid previous service status time');
  }
  if (Boolean(previousNonUpStatus) !== Boolean(previousNonUpSince)) {
    throw new Error('Previous service status and time must be provided together');
  }

  const lastResult = await dbQuery('SELECT status, checked_at, check_id FROM system_uptime_checks ORDER BY checked_at DESC, id DESC LIMIT 1');
  const latestStatus = lastResult.rows?.[0]?.status || null;
  let effectivePriorStatus = latestStatus;
  let recordedDowntime = false;
  if (previousNonUpStatus && previousNonUpSince) {
    const previousCheckId = crypto.createHash('sha256')
      .update(`${previousNonUpStatus}:${previousNonUpSince.toISOString()}`)
      .digest('hex');
    const previousResult = await dbQuery(
      `INSERT INTO system_uptime_checks(check_id, status, checked_at)
       VALUES($1, $2, $3)
       ON CONFLICT (check_id) DO NOTHING`,
      [previousCheckId, previousNonUpStatus, previousNonUpSince.toISOString()]
    );
    const insertedPrevious = Number(previousResult.rowCount || 0) > 0;
    recordedDowntime = previousNonUpStatus === 'down' && insertedPrevious;
    if (insertedPrevious && latestStatus !== previousNonUpStatus) {
      const eventType = previousNonUpStatus === 'down' ? 'service_down' : 'service_degraded';
      await recordSystemEvent({
        type: eventType,
        summary: previousNonUpStatus === 'down' ? 'Service downtime detected' : 'Service degradation detected',
        dedupeKey: `uptime-event:${previousNonUpStatus}:${previousCheckId}`
      });
    }
    const durationSeconds = Math.max(0, Math.floor((checkedAt.getTime() - previousNonUpSince.getTime()) / 1000));
    await dbQuery(
      'UPDATE system_uptime_checks SET duration_seconds = $1 WHERE check_id = $2',
      [durationSeconds, previousCheckId]
    );
    effectivePriorStatus = previousNonUpStatus;
  }

  const status = String(body.status) as 'up' | 'degraded' | 'down';
  if (!previousNonUpStatus && latestStatus === 'down' && status !== 'down' && lastResult.rows?.[0]?.check_id) {
    const lastDownAt = validDate(lastResult.rows[0].checked_at);
    if (lastDownAt) {
      await dbQuery(
        'UPDATE system_uptime_checks SET duration_seconds = $1 WHERE check_id = $2',
        [Math.max(0, Math.floor((checkedAt.getTime() - lastDownAt.getTime()) / 1000)), lastResult.rows[0].check_id]
      );
    }
  }
  const checkId = crypto.createHash('sha256').update(`${status}:${checkedAt.toISOString()}`).digest('hex');
  const currentResult = await dbQuery(
    `INSERT INTO system_uptime_checks(check_id, status, response_ms, checked_at)
     VALUES($1, $2, $3, $4)
     ON CONFLICT (check_id) DO NOTHING`,
    [checkId, status, responseMs, checkedAt.toISOString()]
  );
  if (
    Number(currentResult.rowCount || 0) > 0 &&
    effectivePriorStatus !== status &&
    (effectivePriorStatus !== null || status !== 'up')
  ) {
    const type = status === 'down' ? 'service_down' : status === 'degraded' ? 'service_degraded' : 'service_recovered';
    const summary = status === 'down' ? 'Service is down' : status === 'degraded' ? 'Service is degraded' : 'Service recovered';
    await recordSystemEvent({ type, summary, dedupeKey: `uptime-event:${status}:${checkId}` });
  }
  return { status, recordedDowntime, checkedAt: checkedAt.toISOString() };
}

function verifySignature(req: Request): boolean {
  const secret = String(process.env.NOTEBOOKS_UPDATE_SECRET || '').trim();
  const rawBody = String((req as Request & { rawBody?: string }).rawBody || '');
  const supplied = String(req.headers['x-notebooks-signature'] || '');
  if (!secret || !rawBody || !/^sha256=[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const suppliedBuffer = Buffer.from(supplied.toLowerCase(), 'utf8');
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function splitRepository(value: string): { owner: string; repo: string } {
  const parts = value.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`Invalid target repository: ${value}`);
  return { owner: parts[0], repo: parts[1] };
}

async function findDiscussion(octokit: any, owner: string, repo: string, categoryId: string, marker: string) {
  const response = await octokit.graphql(
    `query($owner: String!, $name: String!, $categoryId: ID!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 100, categoryId: $categoryId, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes { id url body }
        }
      }
    }`,
    { owner, name: repo, categoryId }
  );
  const discussions = response?.repository?.discussions?.nodes || [];
  return discussions.find((discussion: any) => String(discussion.body || '').includes(marker)) || null;
}

async function publishCommunityPost(job: WorkflowJob, octokit: any): Promise<{ id: string; url: string }> {
  const postResult = await dbQuery(
    'SELECT id, title, body, subject, status FROM community_posts WHERE id = $1 LIMIT 1',
    [job.source_id]
  );
  const post = postResult.rows?.[0];
  if (!post) throw new Error(`Community post ${job.source_id} no longer exists`);
  if (post.status !== 'approved') throw new Error(`Community post ${job.source_id} is not approved`);

  const { owner, repo } = splitRepository(job.target_repository);
  const repository = await octokit.graphql(
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategories(first: 100) { nodes { id name } }
      }
    }`,
    { owner, name: repo }
  );
  const repoNode = repository?.repository;
  if (!repoNode?.id) throw new Error(`Could not access Community repository ${job.target_repository}`);
  const category = (repoNode.discussionCategories?.nodes || []).find((item: any) => item.name === 'General');
  if (!category?.id) throw new Error(`General Discussion category is not enabled for ${job.target_repository}`);

  const marker = DISCUSSION_MARKER(Number(post.id));
  const existing = await findDiscussion(octokit, owner, repo, category.id, marker);
  if (existing) return { id: String(existing.id), url: String(existing.url) };

  const content = post.subject ? `[${post.subject}]\n\n${post.body}` : String(post.body || '');
  const created = await octokit.graphql(
    `mutation($input: CreateDiscussionInput!) {
      createDiscussion(input: $input) { discussion { id url } }
    }`,
    {
      input: {
        repositoryId: repoNode.id,
        categoryId: category.id,
        title: String(post.title),
        body: `${content}\n\n${marker}`
      }
    }
  );
  const discussion = created?.createDiscussion?.discussion;
  if (!discussion?.id || !discussion?.url) throw new Error('GitHub did not return the created Discussion');
  return { id: String(discussion.id), url: String(discussion.url) };
}

async function publishIssueProposal(job: WorkflowJob, octokit: any): Promise<{ id: string; url: string; number: number }> {
  const proposalResult = await dbQuery(
    `SELECT id, title, body, stream, source_repository, source_branch, source_path,
            source_start_line, source_end_line, source_text, source_commit,
            source_snippet_hash, note_books_issue_number
     FROM issue_proposals WHERE id = $1 LIMIT 1`,
    [job.source_id]
  );
  const proposal = proposalResult.rows?.[0];
  if (!proposal) throw new Error(`Issue proposal ${job.source_id} no longer exists`);

  const { owner, repo } = splitRepository(job.target_repository);
  const marker = PROPOSAL_MARKER(Number(proposal.id));
  if (proposal.note_books_issue_number) {
    try {
      const saved = await octokit.issues.get({
        owner,
        repo,
        issue_number: Number(proposal.note_books_issue_number)
      });
      if (String(saved.data.body || '').includes(marker)) {
        return {
          id: String(saved.data.node_id || saved.data.number),
          url: String(saved.data.html_url),
          number: Number(saved.data.number)
        };
      }
    } catch (error: any) {
      if (error?.status !== 404) throw error;
    }
  }

  const recent = await octokit.issues.listForRepo({
    owner,
    repo,
    state: 'all',
    sort: 'created',
    direction: 'desc',
    per_page: 100
  });
  let found = (recent.data || []).find((issue: any) =>
    !issue.pull_request && String(issue.body || '').includes(marker)
  );
  if (!found) {
    const existing = await octokit.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:issue "${marker}"`,
      per_page: 10
    });
    found = (existing.data.items || []).find((issue: any) => String(issue.body || '').includes(marker));
  }
  const sourceDetails = [
    `noteBooksSourceRepository: ${proposal.source_repository}`,
    `noteBooksSourceBranch: ${proposal.source_branch}`,
    `noteBooksSourcePath: ${proposal.source_path}`,
    proposal.source_start_line ? `noteBooksSourceLines: ${proposal.source_start_line}-${proposal.source_end_line}` : '',
    proposal.source_commit ? `noteBooksSourceCommit: ${proposal.source_commit}` : '',
    proposal.source_snippet_hash ? `noteBooksSourceSnippetHash: ${proposal.source_snippet_hash}` : '',
    proposal.stream ? `noteBooksStream: ${proposal.stream}` : '',
    '',
    proposal.source_text ? `Selected source:\n${proposal.source_text}\n` : '',
    proposal.body,
    '',
    marker
  ].filter(Boolean).join('\n');

  const issue = found
    ? { data: found }
    : await octokit.issues.create({ owner, repo, title: String(proposal.title), body: sourceDetails });
  const number = Number(issue.data.number);
  const url = String(issue.data.html_url);
  await dbQuery(
    `UPDATE issue_proposals
     SET note_books_issue_number = $1, note_books_issue_url = $2,
         publication_state = 'published', updated_at = now()
     WHERE id = $3`,
    [number, url, proposal.id]
  );
  return { id: String(issue.data.node_id || number), url, number };
}

async function deliverJob(job: WorkflowJob, octokit: any): Promise<{ id: string; url: string }> {
  if (job.job_type === 'community_post') return publishCommunityPost(job, octokit);
  const issue = await publishIssueProposal(job, octokit);
  return { id: issue.id, url: issue.url };
}

async function claimJobs(): Promise<WorkflowJob[]> {
  const result = await dbQuery(
    `WITH ready AS (
       SELECT id FROM system_workflow_jobs
       WHERE (status = 'pending' AND available_at <= now())
          OR (status = 'processing' AND locked_at < now() - interval '10 minutes')
       ORDER BY available_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE system_workflow_jobs AS job
     SET status = 'processing', attempts = job.attempts + 1,
         locked_at = now(), updated_at = now()
     FROM ready
     WHERE job.id = ready.id
     RETURNING job.id, job.job_type, job.source_id, job.target_repository, job.attempts`,
    [MAX_JOBS_PER_RUN]
  );
  return (result.rows || []) as WorkflowJob[];
}

async function recordJobFailure(job: WorkflowJob, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  const failed = job.attempts >= MAX_ATTEMPTS;
  const retrySeconds = Math.min(60 * 60, 30 * (2 ** Math.max(0, job.attempts - 1)));
  await dbQuery(
    `UPDATE system_workflow_jobs
     SET status = $1, last_error = $2, locked_at = NULL,
         available_at = CASE WHEN $1 = 'pending' THEN now() + make_interval(secs => $3::int) ELSE available_at END,
         updated_at = now()
     WHERE id = $4`,
    [failed ? 'failed' : 'pending', message, retrySeconds, job.id]
  );
  if (job.job_type === 'issue_proposal') {
    await dbQuery(
      `UPDATE issue_proposals SET publication_state = $1, updated_at = now() WHERE id = $2`,
      [failed ? 'failed' : 'queued', job.source_id]
    );
  }
  console.error(`[system-workflows] job ${job.id} attempt ${job.attempts} failed: ${message}`);
}

async function processJobs(octokit: any): Promise<{ delivered: number; retried: number; failed: number }> {
  const jobs = await claimJobs();
  const counts = { delivered: 0, retried: 0, failed: 0 };
  for (const job of jobs) {
    try {
      const result = await deliverJob(job, octokit);
      await dbQuery(
        `UPDATE system_workflow_jobs
         SET status = 'delivered', remote_id = $1, remote_url = $2, last_error = NULL,
             locked_at = NULL, updated_at = now()
         WHERE id = $3`,
        [result.id, result.url, job.id]
      );
      if (job.job_type === 'community_post') {
        await dbQuery('UPDATE community_posts SET github_discussion_id = $1 WHERE id = $2', [result.id, job.source_id]);
        const post = await dbQuery('SELECT title FROM community_posts WHERE id = $1', [job.source_id]);
        await recordSystemEvent({
          type: 'community_post_published',
          summary: `Community post published: ${String(post.rows?.[0]?.title || 'Untitled post')}`,
          repository: job.target_repository,
          sourceUrl: result.url,
          dedupeKey: `community-post:${job.source_id}:published`
        });
      } else {
        const proposal = await dbQuery('SELECT title FROM issue_proposals WHERE id = $1', [job.source_id]);
        await recordSystemEvent({
          type: 'issue_added',
          summary: `Issue added: ${String(proposal.rows?.[0]?.title || 'Untitled issue')}`,
          repository: job.target_repository,
          sourceUrl: result.url,
          dedupeKey: `issue-proposal:${job.source_id}:published`
        });
      }
      counts.delivered += 1;
    } catch (error) {
      await recordJobFailure(job, error);
      counts.retried += job.attempts >= MAX_ATTEMPTS ? 0 : 1;
      counts.failed += job.attempts >= MAX_ATTEMPTS ? 1 : 0;
    }
  }
  return counts;
}

async function monitorIssues(octokit: any, repository: { owner: string; repo: string }, startedAt: Date) {
  const repositoryName = `${repository.owner}/${repository.repo}`;
  const stateKey = `issue-cursor:${repositoryName}`;
  const cursorResult = await dbQuery('SELECT value FROM system_workflow_state WHERE key = $1', [stateKey]);
  if (!cursorResult.rows?.length) {
    await dbQuery(
      `INSERT INTO system_workflow_state(key, value) VALUES($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [stateKey, startedAt.toISOString()]
    );
    return { repository: repositoryName, added: 0, updated: 0, initialized: true };
  }
  const cursor = new Date(String(cursorResult.rows[0].value));
  if (Number.isNaN(cursor.getTime())) throw new Error(`Invalid System issue cursor for ${repositoryName}`);

  let pages = 0;
  let partial = false;
  const seen: any[] = [];
  let lastPageUpdatedAt = '';
  for await (const page of octokit.paginate.iterator(octokit.issues.listForRepo, {
    ...repository,
    state: 'all',
    sort: 'updated',
    direction: 'asc',
    since: cursor.toISOString(),
    per_page: 100
  })) {
    pages += 1;
    const lastPageIssue = (page.data || []).at(-1);
    if (lastPageIssue?.updated_at) lastPageUpdatedAt = String(lastPageIssue.updated_at);
    seen.push(...(page.data || []).filter((issue: any) => !issue.pull_request));
    if (pages >= MAX_ISSUE_PAGES) {
      partial = (page.data || []).length === 100;
      break;
    }
  }

  let added = 0;
  let updated = 0;
  for (const issue of seen) {
    const createdAt = new Date(issue.created_at);
    const isNew = createdAt >= cursor;
    const eventType = isNew ? 'issue_added' : 'issue_updated';
    const eventAt = String(issue.updated_at || issue.created_at);
    const title = String(issue.title || 'Untitled issue').slice(0, 400);
    const state = String(issue.state || 'open');
    const proposalId = Number(String(issue.body || '').match(/noteBooksProposalId:\s*(\d+)/i)?.[1] || 0);
    await recordSystemEvent({
      type: eventType,
      summary: isNew
        ? `Issue added: ${title}`
        : `Issue ${state}: ${title}`,
      repository: repositoryName,
      sourceUrl: String(issue.html_url || ''),
      dedupeKey: proposalId && isNew
        ? `issue-proposal:${proposalId}:published`
        : `github-issue:${repositoryName}#${issue.number}:${eventAt}`
    });
    if (isNew) added += 1;
    else updated += 1;
  }

  const lastPageTime = lastPageUpdatedAt ? new Date(lastPageUpdatedAt).getTime() : Number.NaN;
  const nextCursor = partial && Number.isFinite(lastPageTime)
    ? new Date(Math.max(cursor.getTime(), lastPageTime - 1)).toISOString()
    : startedAt.toISOString();
  await dbQuery(
    `UPDATE system_workflow_state SET value = $1, updated_at = now() WHERE key = $2`,
    [nextCursor, stateKey]
  );
  return { repository: repositoryName, added, updated, initialized: false, partial };
}

export async function runSystemWorkflows(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!verifySignature(req)) {
    res.status(401).json({ error: 'Invalid workflow signature' });
    return;
  }
  if (!isDbConfigured()) {
    res.status(503).json({ error: 'System workflows require the database foundation' });
    return;
  }

  try {
    const startedAt = new Date();
    const uptime = await recordUptimeObservation(req.body?.uptime);
    const octokit = await getOctokit({ allowUnauthenticated: false });
    const jobs = await processJobs(octokit);
    const configuredIssuesRepo = await getStreamRepo('issues');
    const fallbackIssuesRepo = String(process.env.GITHUB_ISSUES_REPO || '').trim().split('/');
    const issuesRepository = configuredIssuesRepo || (
      fallbackIssuesRepo.length === 2 && fallbackIssuesRepo[0] && fallbackIssuesRepo[1]
        ? { owner: fallbackIssuesRepo[0], repo: fallbackIssuesRepo[1] }
        : null
    );
    const issueMonitor = issuesRepository
      ? await monitorIssues(octokit, { owner: issuesRepository.owner, repo: issuesRepository.repo }, startedAt)
      : null;
    res.status(200).json({ success: true, uptime, jobs, issueMonitor });
  } catch (error) {
    console.error('[system-workflows] run failed', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'System workflow run failed; scheduled invocation may be retried' });
  }
}
