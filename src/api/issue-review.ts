import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { getOctokit } from './_shared.js';

function proposalId(req: Request): number {
  const id = Number(req.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function emailFrom(req: Request): string | null {
  const value = (req as any).auth?.email;
  return value ? String(value).trim().toLowerCase() : null;
}

function normalizeDecision(value: unknown): 'triaged' | 'request_changes' | 'approved' | 'rejected' | null {
  return value === 'triaged' || value === 'request_changes' || value === 'approved' || value === 'rejected' ? value : null;
}

function decodeContent(content: string): string {
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8').replace(/\r\n/g, '\n');
}

async function getProposal(id: number): Promise<any | null> {
  if (!isDbConfigured()) return null;
  const result = await dbQuery('SELECT * FROM issue_proposals WHERE id = $1 LIMIT 1', [id]);
  return result.rows?.[0] || null;
}

async function getCurrentSource(proposal: any): Promise<{ text: string; commit: string } | null> {
  const [owner, repo] = String(proposal.source_repository || '').split('/').filter(Boolean);
  if (!owner || !repo || !proposal.source_path) return null;
  const octokit = await getOctokit({ allowUnauthenticated: true });
  const response = await octokit.repos.getContent({ owner, repo, path: proposal.source_path, ref: proposal.source_branch || 'main' });
  const item = Array.isArray(response.data) ? response.data[0] : response.data as any;
  if (!item || typeof item.content !== 'string') return null;
  return { text: decodeContent(item.content), commit: String(item.sha || '') };
}

export async function listProposals(req: Request, res: Response): Promise<void> {
  if (!isDbConfigured()) { res.status(503).json({ error: 'Issue review requires the database foundation' }); return; }
  const status = String(req.query.status || '').trim();
  try {
    const result = await dbQuery(`SELECT id, author_email, title, body, stream, source_repository, source_branch, source_path,
                                         source_start_line, source_end_line, source_text, source_commit, source_snippet_hash,
                                         source_snapshot_text, current_source_commit, source_is_stale, note_books_issue_number,
                                         note_books_issue_url, status, created_at, updated_at
                                  FROM issue_proposals
                                  ${status ? 'WHERE status = $1' : ''}
                                  ORDER BY created_at DESC LIMIT 100`, status ? [status] : []);
    res.status(200).json({ proposals: result.rows });
  } catch (error) {
    console.error('[issue-review] list failed', error);
    res.status(500).json({ error: 'Could not list Issue proposals' });
  }
}

export async function getDiff(req: Request, res: Response): Promise<void> {
  const id = proposalId(req);
  if (!id) { res.status(400).json({ error: 'Valid proposal id is required' }); return; }
  const proposal = await getProposal(id);
  if (!proposal) { res.status(isDbConfigured() ? 404 : 503).json({ error: isDbConfigured() ? 'Issue proposal not found' : 'Issue review requires the database foundation' }); return; }
  try {
    const current = await getCurrentSource(proposal);
    if (!current) { res.status(502).json({ error: 'Current source could not be loaded' }); return; }
    const original = String(proposal.source_snapshot_text || proposal.source_text || '');
    const selectedStart = Number(proposal.source_start_line || 0);
    const selectedEnd = Number(proposal.source_end_line || selectedStart);
    const selectedCurrent = current.text.split('\n').slice(Math.max(0, selectedStart - 1), selectedEnd).join('\n');
    const stale = Boolean(proposal.source_commit && current.commit && proposal.source_commit !== current.commit) || (Boolean(original) && Boolean(selectedStart) && selectedCurrent !== original);
    if (proposal.source_is_stale !== stale) {
      await dbQuery('UPDATE issue_proposals SET current_source_commit = $1, source_is_stale = $2, updated_at = now() WHERE id = $3', [current.commit || null, stale, id]);
    }
    res.status(200).json({ proposalId: id, original, current: current.text, currentCommit: current.commit, selectedCurrent, stale, sourceStartLine: selectedStart || null, sourceEndLine: selectedEnd || null });
  } catch (error) {
    console.error('[issue-review] diff failed', error);
    res.status(502).json({ error: 'Could not calculate source diff' });
  }
}

export async function listComments(req: Request, res: Response): Promise<void> {
  const id = proposalId(req);
  if (!id) { res.status(400).json({ error: 'Valid proposal id is required' }); return; }
  if (!isDbConfigured()) { res.status(503).json({ error: 'Issue comments require the database foundation' }); return; }
  try {
    const result = await dbQuery(`SELECT id, proposal_id, author_email, body, created_at
                                  FROM issue_proposal_comments WHERE proposal_id = $1 ORDER BY created_at ASC LIMIT 200`, [id]);
    res.status(200).json({ comments: result.rows });
  } catch (error) {
    console.error('[issue-review] comments list failed', error);
    res.status(500).json({ error: 'Could not list Issue comments' });
  }
}

export async function createComment(req: Request, res: Response): Promise<void> {
  const email = emailFrom(req);
  const id = proposalId(req);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!id || !isDbConfigured()) { res.status(isDbConfigured() ? 400 : 503).json({ error: isDbConfigured() ? 'Valid proposal id is required' : 'Issue comments require the database foundation' }); return; }
  const body = String(req.body?.body || '').trim();
  if (!body || body.length > 5000) { res.status(400).json({ error: 'Comment must be between 1 and 5000 characters' }); return; }
  try {
    const user = await dbQuery('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    const proposal = await getProposal(id);
    if (!proposal) { res.status(404).json({ error: 'Issue proposal not found' }); return; }
    const result = await dbQuery(`INSERT INTO issue_proposal_comments(proposal_id, author_user_id, author_email, body)
                                  VALUES($1,$2,$3,$4) RETURNING id, proposal_id, author_email, body, created_at`, [id, user.rows?.[0]?.id || null, email, body]);
    res.status(201).json({ comment: result.rows[0] });
  } catch (error) {
    console.error('[issue-review] comment create failed', error);
    res.status(500).json({ error: 'Could not add Issue comment' });
  }
}

export async function reviewProposal(req: Request, res: Response): Promise<void> {
  const email = emailFrom(req);
  const id = proposalId(req);
  const decision = normalizeDecision(req.body?.decision);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (!id || !decision || !isDbConfigured()) { res.status(isDbConfigured() ? 400 : 503).json({ error: isDbConfigured() ? 'Valid proposal id and review decision are required' : 'Issue review requires the database foundation' }); return; }
  const note = String(req.body?.note || '').trim().slice(0, 10_000);
  const proposedContent = req.body?.proposedContent == null ? null : String(req.body.proposedContent);
  if (proposedContent !== null && proposedContent.length > 1_000_000) { res.status(400).json({ error: 'Proposed content is too large' }); return; }
  if (decision === 'approved' && !proposedContent?.trim()) { res.status(400).json({ error: 'Approved proposals require proposed replacement content' }); return; }
  try {
    const reviewer = await dbQuery('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    const proposal = await getProposal(id);
    if (!proposal) { res.status(404).json({ error: 'Issue proposal not found' }); return; }
    const current = await getCurrentSource(proposal);
    if (!current) { res.status(502).json({ error: 'Current source could not be loaded' }); return; }
    const original = String(proposal.source_snapshot_text || proposal.source_text || '');
    const selectedStart = Number(proposal.source_start_line || 0);
    const selectedEnd = Number(proposal.source_end_line || selectedStart);
    const selectedCurrent = selectedStart ? current.text.split('\n').slice(selectedStart - 1, selectedEnd).join('\n') : '';
    const stale = Boolean(proposal.source_commit && current.commit && proposal.source_commit !== current.commit) || (Boolean(original) && Boolean(selectedStart) && selectedCurrent !== original);
    if (decision === 'approved' && stale) { res.status(409).json({ error: 'Source changed; refresh the diff before approving this proposal' }); return; }
    const updated = await dbQuery('UPDATE issue_proposals SET status = $1, current_source_commit = $2, source_is_stale = $3, updated_at = now() WHERE id = $4 RETURNING id, status, current_source_commit, source_is_stale, updated_at', [decision === 'request_changes' ? 'triaged' : decision, current.commit || null, stale, id]);
    const review = await dbQuery(`INSERT INTO issue_proposal_reviews(proposal_id, reviewer_user_id, reviewer_email, decision, note, proposed_content, original_commit, current_commit, current_source_text, source_is_stale)
                                  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                                  RETURNING id, proposal_id, reviewer_email, decision, note, proposed_content, original_commit, current_commit, source_is_stale, created_at`, [id, reviewer.rows?.[0]?.id || null, email, decision, note, proposedContent, proposal.source_commit || null, current.commit || null, current.text, stale]);
    res.status(200).json({ proposal: updated.rows[0], review: review.rows[0] });
  } catch (error) {
    console.error('[issue-review] review failed', error);
    res.status(500).json({ error: 'Could not record Issue review' });
  }
}
