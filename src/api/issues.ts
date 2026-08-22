import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { findRegisteredRepo, getOctokit } from './_shared.js';

const ISSUES_REPO = () => String(process.env.GITHUB_ISSUES_REPO || 'fsr-official/NoteBooks-Issues').trim();

function splitRepo(value: string): { owner: string; repo: string } | null {
  const [owner, repo] = value.split('/').map((part) => part.trim()).filter(Boolean);
  return owner && repo && value.split('/').length === 2 ? { owner, repo } : null;
}

function normalizePath(value: unknown): string {
  return String(value || '').trim().replace(/^\/+/, '').replace(/\\/g, '/');
}

export function isSafeSourcePath(value: unknown): boolean {
  const sourcePath = normalizePath(value);
  return Boolean(sourcePath) && sourcePath.length <= 500 && !sourcePath.split('/').includes('..') && !/[\u0000\r\n]/.test(sourcePath);
}

function authEmail(req: Request): string | null {
  const email = (req as any).auth?.email;
  return email ? String(email).trim().toLowerCase() : null;
}

function issueRepository(): { owner: string; repo: string } | null {
  return splitRepo(ISSUES_REPO());
}

async function getIssueProposal(id: number): Promise<any | null> {
  if (!isDbConfigured()) return null;
  const result = await dbQuery('SELECT * FROM issue_proposals WHERE id = $1 LIMIT 1', [id]);
  return result.rows?.[0] || null;
}

async function getUserId(email: string): Promise<number | null> {
  if (!isDbConfigured()) return null;
  const result = await dbQuery('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return result.rows?.[0]?.id ? Number(result.rows[0].id) : null;
}

async function voteSummary(issueId: number, userId?: number | null) {
  if (!isDbConfigured()) return { upvotes: 0, downvotes: 0, score: 0, viewerVote: null };
  const counts = await dbQuery(
    `SELECT COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0)::int AS upvotes,
            COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0)::int AS downvotes
     FROM issue_votes WHERE issue_id = $1`,
    [issueId],
  );
  let viewerVote: number | null = null;
  if (userId) {
    const viewer = await dbQuery('SELECT value FROM issue_votes WHERE issue_id = $1 AND user_id = $2 LIMIT 1', [issueId, userId]);
    viewerVote = viewer.rows?.[0]?.value ? Number(viewer.rows[0].value) : null;
  }
  const upvotes = Number(counts.rows?.[0]?.upvotes || 0);
  const downvotes = Number(counts.rows?.[0]?.downvotes || 0);
  return { upvotes, downvotes, score: upvotes - downvotes, viewerVote };
}

export async function listIssues(req: Request, res: Response): Promise<void> {
  const configuredRepo = issueRepository();
  if (!configuredRepo) {
    res.status(500).json({ error: 'Issues repo is not configured' });
    return;
  }
  try {
    const octokit = await getOctokit({ allowUnauthenticated: true });
    const response = await octokit.issues.listForRepo({ owner: configuredRepo.owner, repo: configuredRepo.repo, state: 'open', per_page: 50, sort: 'updated', direction: 'desc' });
    const items = await Promise.all((response.data || []).filter((issue: any) => !issue.pull_request).map(async (issue: any) => {
      const proposalId = Number(issue.body?.match(/noteBooksProposalId:\s*(\d+)/i)?.[1] || 0);
      return {
        id: proposalId || issue.number,
        githubIssueNumber: issue.number,
        title: issue.title,
        body: issue.body || '',
        url: issue.html_url,
        state: issue.state,
        labels: (issue.labels || []).map((label: any) => typeof label === 'string' ? label : label.name).filter(Boolean),
        updatedAt: issue.updated_at,
        votes: proposalId ? await voteSummary(proposalId) : { upvotes: 0, downvotes: 0, score: 0, viewerVote: null },
      };
    }));
    res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
    res.status(200).json({ repository: `${configuredRepo.owner}/${configuredRepo.repo}`, items });
  } catch (error: any) {
    console.error('[issues] feed failed', error);
    res.status(502).json({ error: 'Issues feed is unavailable' });
  }
}

export async function createProposal(req: Request, res: Response): Promise<void> {
  const email = authEmail(req);
  if (!email) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!isDbConfigured()) {
    res.status(503).json({ error: 'Issue proposals require the database foundation' });
    return;
  }

  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const stream = String(req.body?.stream || '').trim().toLowerCase() || null;
  const sourceRepository = String(req.body?.sourceRepository || '').trim();
  const sourceBranch = String(req.body?.sourceBranch || 'main').trim() || 'main';
  const sourcePath = normalizePath(req.body?.sourcePath);
  if (!title || title.length > 200 || !body || body.length > 20_000 || !sourceRepository || !isSafeSourcePath(sourcePath)) {
    res.status(400).json({ error: 'Title, body, source repository, and safe source path are required' });
    return;
  }

  const sourceParts = splitRepo(sourceRepository);
  if (!sourceParts) {
    res.status(400).json({ error: 'sourceRepository must use owner/repository format' });
    return;
  }
  const registered = await findRegisteredRepo(sourceParts.owner, sourceParts.repo);
  if (!registered) {
    res.status(400).json({ error: 'Source repository is not registered by NoteBooks' });
    return;
  }
  const userId = await getUserId(email);
  const targetIssuesRepo = issueRepository();
  if (!targetIssuesRepo || !userId) {
    res.status(503).json({ error: 'Issue identity or repository configuration is unavailable' });
    return;
  }

  try {
    const octokit = await getOctokit({ allowUnauthenticated: false });
    const issueBody = [
      `noteBooksSourceRepository: ${sourceRepository}`,
      `noteBooksSourceBranch: ${sourceBranch}`,
      `noteBooksSourcePath: ${sourcePath}`,
      stream ? `noteBooksStream: ${stream}` : '',
      '',
      body,
    ].filter(Boolean).join('\n');
    const issue = await octokit.issues.create({ owner: targetIssuesRepo.owner, repo: targetIssuesRepo.repo, title, body: issueBody });
    const inserted = await dbQuery(
      `INSERT INTO issue_proposals(author_user_id, author_email, title, body, stream, source_repository, source_branch, source_path, note_books_issue_number, note_books_issue_url, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted')
       RETURNING *`,
      [userId, email, title, body, stream, sourceRepository, sourceBranch, sourcePath, issue.data.number, issue.data.html_url],
    );
    const proposal = inserted.rows?.[0];
    if (proposal?.id) {
      await octokit.issues.update({ owner: targetIssuesRepo.owner, repo: targetIssuesRepo.repo, issue_number: issue.data.number, body: `${issueBody}\n\nnoteBooksProposalId: ${proposal.id}` });
    }
    res.status(201).json({ proposal, issue: issue.data });
  } catch (error: any) {
    console.error('[issues] proposal creation failed', error);
    res.status(502).json({ error: 'Could not create the NoteBooks-Issues record' });
  }
}

export async function voteIssue(req: Request, res: Response): Promise<void> {
  const email = authEmail(req);
  const value = Number(req.body?.value);
  const issueId = Number(req.params.id);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (![-1, 1].includes(value) || !Number.isSafeInteger(issueId) || issueId <= 0) { res.status(400).json({ error: 'Vote must be 1 or -1 for a valid issue' }); return; }
  if (!isDbConfigured()) { res.status(503).json({ error: 'Voting requires the database foundation' }); return; }
  try {
    const userId = await getUserId(email);
    const issue = await getIssueProposal(issueId);
    if (!userId || !issue) { res.status(404).json({ error: 'Issue proposal not found' }); return; }
    await dbQuery(
      `INSERT INTO issue_votes(issue_id, user_id, value, updated_at) VALUES($1,$2,$3,now())
       ON CONFLICT (issue_id, user_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [issueId, userId, value],
    );
    res.status(200).json({ issueId, votes: await voteSummary(issueId, userId) });
  } catch (error: any) {
    console.error('[issues] vote failed', error);
    res.status(500).json({ error: 'Could not record vote' });
  }
}

export async function removeVote(req: Request, res: Response): Promise<void> {
  const email = authEmail(req);
  const issueId = Number(req.params.id);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!isDbConfigured()) { res.status(503).json({ error: 'Voting requires the database foundation' }); return; }
  try {
    const userId = await getUserId(email);
    if (!userId || !Number.isSafeInteger(issueId) || issueId <= 0) { res.status(400).json({ error: 'Invalid issue vote' }); return; }
    await dbQuery('DELETE FROM issue_votes WHERE issue_id = $1 AND user_id = $2', [issueId, userId]);
    res.status(200).json({ issueId, votes: await voteSummary(issueId, userId) });
  } catch (error: any) {
    console.error('[issues] vote removal failed', error);
    res.status(500).json({ error: 'Could not remove vote' });
  }
}

export async function createPullRequest(req: Request, res: Response): Promise<void> {
  const issueId = Number(req.params.id);
  if (!Number.isSafeInteger(issueId) || issueId <= 0 || !isDbConfigured()) {
    res.status(isDbConfigured() ? 400 : 503).json({ error: isDbConfigured() ? 'Invalid issue proposal' : 'PR workflow requires the database foundation' });
    return;
  }
  const proposal = await getIssueProposal(issueId);
  const content = String(req.body?.content || '');
  if (!proposal || !content || content.length > 1_000_000) {
    res.status(400).json({ error: 'Issue proposal and replacement content are required' });
    return;
  }
  const target = splitRepo(String(proposal.source_repository));
  if (!target || !isSafeSourcePath(proposal.source_path)) {
    res.status(400).json({ error: 'Stored source repository or path is invalid' });
    return;
  }

  try {
    const octokit = await getOctokit({ allowUnauthenticated: false });
    const branch = `notebooks/issue-${issueId}-${Date.now()}`;
    const ref = await octokit.git.getRef({ owner: target.owner, repo: target.repo, ref: `heads/${proposal.source_branch}` });
    const baseSha = ref.data.object.sha;
    await octokit.git.createRef({ owner: target.owner, repo: target.repo, ref: `refs/heads/${branch}`, sha: baseSha });
    let existingSha: string | undefined;
    try {
      const existing = await octokit.repos.getContent({ owner: target.owner, repo: target.repo, path: proposal.source_path, ref: proposal.source_branch });
      if (!Array.isArray(existing.data)) existingSha = existing.data.sha;
    } catch {
      // A new file has no existing blob SHA.
    }
    await octokit.repos.createOrUpdateFileContents({
      owner: target.owner,
      repo: target.repo,
      path: proposal.source_path,
      message: `Address NoteBooks issue #${issueId}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    });
    const pr = await octokit.pulls.create({ owner: target.owner, repo: target.repo, title: `Address NoteBooks issue: ${proposal.title}`, head: branch, base: proposal.source_branch, body: `Resolves NoteBooks issue proposal #${issueId}.` });
    await dbQuery('UPDATE issue_proposals SET status = $1, updated_at = now() WHERE id = $2', ['pr_open', issueId]);
    await dbQuery(
      `INSERT INTO pr_lifecycle(issue_id, target_repository, target_branch, source_branch, pr_number, pr_url, state, created_by)
       VALUES($1,$2,$3,$4,$5,$6,'open',$7)`,
      [issueId, proposal.source_repository, proposal.source_branch, branch, pr.data.number, pr.data.html_url, (req as any).auth?.userId || null],
    );
    const issuesRepo = issueRepository();
    if (issuesRepo && proposal.note_books_issue_number) {
      await octokit.issues.createComment({ owner: issuesRepo.owner, repo: issuesRepo.repo, issue_number: proposal.note_books_issue_number, body: `PR opened in ${proposal.source_repository}: ${pr.data.html_url}` }).catch(() => undefined);
    }
    res.status(201).json({ pr: pr.data, targetRepository: proposal.source_repository });
  } catch (error: any) {
    console.error('[issues] PR creation failed', error);
    res.status(502).json({ error: 'Could not create the repository pull request' });
  }
}

export default { listIssues, createProposal, voteIssue, removeVote, createPullRequest };
