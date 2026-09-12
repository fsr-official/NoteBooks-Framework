import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { parseAuthToken, hasRole } from '../lib/permissions.js';
import { isRoleKey, type RoleKey } from '../lib/roles.js';
import { sanitizeBlocks, validateBlocks } from '../lib/ai-markdown.js';

const DEFAULT_CHANNELS = [
  { id: 1, slug: 'general', name: 'General', description: 'Open Community conversation and questions.', visibility: 'public', allowedRoleKeys: [], archived: false },
  { id: 2, slug: 'announcements', name: 'Announcements', description: 'Important NoteBooks updates and notices.', visibility: 'public', allowedRoleKeys: [], archived: false },
  { id: 3, slug: 'science', name: 'Science', description: 'Discussion around the Science stream.', visibility: 'public', allowedRoleKeys: [], archived: false },
  { id: 4, slug: 'commerce', name: 'Commerce', description: 'Discussion around the Commerce stream.', visibility: 'public', allowedRoleKeys: [], archived: false },
  { id: 5, slug: 'humanities', name: 'Humanities', description: 'Discussion around the Humanities stream.', visibility: 'public', allowedRoleKeys: [], archived: false },
  { id: 6, slug: 'help', name: 'Help', description: 'Ask for help using NoteBooks and its libraries.', visibility: 'public', allowedRoleKeys: [], archived: false },
  { id: 7, slug: 'issue-triage', name: 'Issue Triage', description: 'Discuss reported issues and source improvements.', visibility: 'role', allowedRoleKeys: ['issues_mod', 'community_mod', 'super_admin', 'verified_member'], archived: false },
] as const;

const inMemoryMessages: any[] = [];
const inMemoryReads = new Map<string, string>();
const inMemoryReports: any[] = [];
const inMemoryModerationEvents: any[] = [];

const MODERATOR_ROLES: RoleKey[] = ['super_admin', 'community_mod', 'issues_mod', 'content_mod'];

function isModerator(decoded: any): boolean {
  return decoded?.role === 'admin' || MODERATOR_ROLES.some((role) => hasRole(decoded, role));
}

function messageForId(id: number): any | null {
  return inMemoryMessages.find((message) => message.id === id) || null;
}

function moderationAction(value: unknown): 'flag' | 'remove' | 'restore' | null {
  return value === 'flag' || value === 'remove' || value === 'restore' ? value : null;
}

function safeReportReason(value: unknown): string {
  return String(value || '').trim().slice(0, 500);
}

function auth(req: Request): any | null {
  return (req as any).auth || parseAuthToken(req);
}

function emailFrom(req: Request): string | null {
  const value = auth(req)?.email;
  return value ? String(value).trim().toLowerCase() : null;
}

function normalizeSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
}

function roleKeys(decoded: any): RoleKey[] {
  const values = Array.isArray(decoded?.roles) ? decoded.roles : Array.isArray(decoded?.role_keys) ? decoded.role_keys : [];
  return values.filter(isRoleKey);
}

function normalizeChannel(row: any) {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description || ''),
    visibility: row.visibility === 'role' ? 'role' : 'public',
    allowedRoleKeys: Array.isArray(row.allowed_role_keys) ? row.allowed_role_keys.filter(isRoleKey) : Array.isArray(row.allowedRoleKeys) ? row.allowedRoleKeys.filter(isRoleKey) : [],
    archived: Boolean(row.archived),
  };
}

function canAccessChannel(channel: any, decoded: any): boolean {
  if (channel.archived) return false;
  if (channel.visibility !== 'role') return true;
  if (!decoded?.email) return false;
  if (decoded.role === 'admin' || hasRole(decoded, 'super_admin')) return true;
  const roles = roleKeys(decoded);
  return channel.allowedRoleKeys.some((key: RoleKey) => roles.includes(key));
}

async function findChannel(slug: string): Promise<any | null> {
  if (!isDbConfigured()) return DEFAULT_CHANNELS.find((channel) => channel.slug === slug) || null;
  const result = await dbQuery('SELECT id, slug, name, description, visibility, allowed_role_keys, archived FROM community_channels WHERE slug = $1 LIMIT 1', [slug]);
  return result.rows?.[0] ? normalizeChannel(result.rows[0]) : null;
}

async function userIdForEmail(email: string): Promise<number | null> {
  if (!isDbConfigured()) return null;
  const result = await dbQuery('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return result.rows?.[0]?.id ? Number(result.rows[0].id) : null;
}

async function isBanned(channelId: number, email: string): Promise<boolean> {
  if (!isDbConfigured()) return false;
  const userId = await userIdForEmail(email);
  if (!userId) return false;
  const result = await dbQuery('SELECT membership_status FROM community_channel_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1', [channelId, userId]);
  return result.rows?.[0]?.membership_status === 'banned';
}

async function unreadCount(channelId: number, email: string | null): Promise<number> {
  if (!email) return 0;
  if (!isDbConfigured()) {
    const readAt = inMemoryReads.get(`${email}:${DEFAULT_CHANNELS.find((channel) => channel.id === channelId)?.slug || channelId}`);
    return inMemoryMessages.filter((message) => message.channelId === channelId && message.status !== 'removed' && (!readAt || message.created_at > readAt)).length;
  }
  const userId = await userIdForEmail(email);
  if (!userId) return 0;
  const result = await dbQuery(`SELECT COUNT(*)::int AS count
                                FROM community_messages m
                                LEFT JOIN community_channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
                                WHERE m.channel_id = $1 AND m.status <> 'removed'
                                  AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)`, [channelId, userId]);
  return Number(result.rows?.[0]?.count || 0);
}

export async function listChannels(req: Request, res: Response): Promise<void> {
  try {
    const decoded = auth(req);
    const email = emailFrom(req);
    const rows = isDbConfigured()
      ? (await dbQuery('SELECT id, slug, name, description, visibility, allowed_role_keys, archived FROM community_channels WHERE archived = false ORDER BY id ASC LIMIT 100')).rows
      : DEFAULT_CHANNELS;
    const channels = await Promise.all(rows.map(async (row: any) => {
      const channel = normalizeChannel(row);
      return canAccessChannel(channel, decoded) ? { ...channel, unreadCount: await unreadCount(channel.id, email) } : null;
    }));
    res.status(200).json({ channels: channels.filter(Boolean) });
  } catch (error) {
    console.error('[community-channels] list failed', error);
    res.status(500).json({ error: 'Could not list Community channels' });
  }
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const slug = normalizeSlug(req.params.slug);
  const channel = await findChannel(slug);
  if (!channel) { res.status(404).json({ error: 'Channel not found' }); return; }
  const decoded = auth(req);
  if (!canAccessChannel(channel, decoded)) { res.status(decoded?.email ? 403 : 401).json({ error: decoded?.email ? 'Channel access denied' : 'Authentication required for this channel' }); return; }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  try {
    const rows = isDbConfigured()
      ? (await dbQuery(`SELECT id, author_email, body, status, reply_to_id, created_at, edited_at
                        FROM community_messages WHERE channel_id = $1 AND status <> 'removed'
                        ORDER BY created_at DESC, id DESC LIMIT $2`, [channel.id, limit])).rows.reverse()
      : inMemoryMessages.filter((message) => message.channelId === channel.id && message.status !== 'removed').slice(-limit);
    res.status(200).json({ channel, messages: rows.map((row: any) => ({ id: Number(row.id), author: String(row.author_email || '').split('@')[0] || 'Member', body: String(row.body || ''), status: row.status || 'active', replyToId: row.reply_to_id ? Number(row.reply_to_id) : null, createdAt: row.created_at, editedAt: row.edited_at || null })) });
  } catch (error) {
    console.error('[community-channels] messages failed', error);
    res.status(500).json({ error: 'Could not load channel messages' });
  }
}

export async function createMessage(req: Request, res: Response): Promise<void> {
  const email = emailFrom(req);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  const slug = normalizeSlug(req.params.slug);
  const channel = await findChannel(slug);
  if (!channel) { res.status(404).json({ error: 'Channel not found' }); return; }
  if (!canAccessChannel(channel, auth(req))) { res.status(403).json({ error: 'Channel access denied' }); return; }
  if (await isBanned(channel.id, email)) { res.status(403).json({ error: 'You are banned from this channel' }); return; }
  const input = String(req.body?.body || '').trim();
  if (!input || input.length > 4000) { res.status(400).json({ error: 'Message body must be between 1 and 4000 characters' }); return; }
  const validation = validateBlocks(input);
  if (!validation.ok) { res.status(400).json({ error: 'Invalid interactive blocks', details: validation.errors }); return; }
  const body = sanitizeBlocks(input).sanitized || input;
  const issueProposalId = req.body?.issueProposalId == null ? null : Number(req.body.issueProposalId);
  if (issueProposalId !== null && (!Number.isSafeInteger(issueProposalId) || issueProposalId <= 0 || channel.slug !== 'issue-triage')) { res.status(400).json({ error: 'A valid Issue proposal can only be linked from issue-triage' }); return; }
  if (isDbConfigured() && issueProposalId !== null) {
    const proposal = await dbQuery('SELECT id FROM issue_proposals WHERE id = $1 LIMIT 1', [issueProposalId]);
    if (!proposal.rows?.[0]) { res.status(404).json({ error: 'Issue proposal not found' }); return; }
  }
  const replyToId = req.body?.replyToId == null ? null : Number(req.body.replyToId);
  if (replyToId !== null && (!Number.isSafeInteger(replyToId) || replyToId <= 0)) { res.status(400).json({ error: 'Invalid reply target' }); return; }
  try {
    if (isDbConfigured()) {
      const userId = await userIdForEmail(email);
      const result = await dbQuery(`INSERT INTO community_messages(channel_id, author_user_id, author_email, body, reply_to_id, issue_proposal_id)
                                     VALUES($1,$2,$3,$4,$5,$6)
                                     RETURNING id, author_email, body, status, reply_to_id, issue_proposal_id, created_at, edited_at`, [channel.id, userId, email, body, replyToId, issueProposalId]);
      res.status(201).json({ channel, message: { id: Number(result.rows[0].id), author: email.split('@')[0], body: result.rows[0].body, status: result.rows[0].status, replyToId: result.rows[0].reply_to_id ? Number(result.rows[0].reply_to_id) : null, issueProposalId: result.rows[0].issue_proposal_id ? Number(result.rows[0].issue_proposal_id) : null, createdAt: result.rows[0].created_at, editedAt: null } });
      return;
    }
    const message = { id: inMemoryMessages.length + 1, channelId: channel.id, author_email: email, body, status: 'active', reply_to_id: replyToId, issueProposalId: issueProposalId, created_at: new Date().toISOString(), edited_at: null };
    inMemoryMessages.push(message);
    res.status(201).json({ channel, message: { id: message.id, author: email.split('@')[0], body, status: message.status, replyToId, issueProposalId, createdAt: message.created_at, editedAt: null } });
  } catch (error) {
    console.error('[community-channels] create message failed', error);
    res.status(500).json({ error: 'Could not create Community message' });
  }
}

export async function markChannelRead(req: Request, res: Response): Promise<void> {
  const email = emailFrom(req);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  const slug = normalizeSlug(req.params.slug);
  const channel = await findChannel(slug);
  if (!channel) { res.status(404).json({ error: 'Channel not found' }); return; }
  if (!canAccessChannel(channel, auth(req))) { res.status(403).json({ error: 'Channel access denied' }); return; }
  const readAt = new Date().toISOString();
  try {
    if (isDbConfigured()) {
      const userId = await userIdForEmail(email);
      if (userId) {
        await dbQuery(`INSERT INTO community_channel_members(channel_id, user_id, last_read_at)
                       VALUES($1,$2,$3)
                       ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`, [channel.id, userId, readAt]);
      }
    } else {
      inMemoryReads.set(`${email}:${channel.slug}`, readAt);
    }
    res.status(200).json({ channel: channel.slug, readAt });
  } catch (error) {
    console.error('[community-channels] mark read failed', error);
    res.status(500).json({ error: 'Could not mark channel as read' });
  }
}


export async function reportMessage(req: Request, res: Response): Promise<void> {
  const email = emailFrom(req);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  const messageId = Number(req.params.id);
  const reason = safeReportReason(req.body?.reason);
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || reason.length < 5) { res.status(400).json({ error: 'A valid message and report reason are required' }); return; }
  try {
    if (isDbConfigured()) {
      const userId = await userIdForEmail(email);
      const message = await dbQuery('SELECT id, channel_id FROM community_messages WHERE id = $1 LIMIT 1', [messageId]);
      if (!message.rows?.[0]) { res.status(404).json({ error: 'Message not found' }); return; }
      const inserted = await dbQuery(`INSERT INTO community_message_reports(message_id, reporter_user_id, reporter_email, reason)
                                      VALUES($1,$2,$3,$4)
                                      ON CONFLICT (message_id, reporter_email) DO UPDATE SET reason = EXCLUDED.reason, status = 'open'
                                      RETURNING id, message_id, reporter_email, reason, status, created_at`, [messageId, userId, email, reason]);
      await dbQuery(`INSERT INTO community_moderation_events(message_id, channel_id, actor_user_id, actor_email, action, reason)
                     VALUES($1,$2,$3,$4,'flag',$5)`, [messageId, message.rows[0].channel_id, userId, email, reason]);
      res.status(201).json({ report: inserted.rows[0] });
      return;
    }
    const message = messageForId(messageId);
    if (!message) { res.status(404).json({ error: 'Message not found' }); return; }
    const existing = inMemoryReports.find((report) => report.messageId === messageId && report.reporterEmail === email);
    const report = existing || { id: inMemoryReports.length + 1, messageId, reporterEmail: email, createdAt: new Date().toISOString() };
    report.reason = reason;
    report.status = 'open';
    if (!existing) inMemoryReports.push(report);
    inMemoryModerationEvents.push({ messageId, channelId: message.channelId, actorEmail: email, action: 'flag', reason, createdAt: new Date().toISOString() });
    res.status(201).json({ report });
  } catch (error) {
    console.error('[community-channels] report failed', error);
    res.status(500).json({ error: 'Could not report message' });
  }
}

export async function listReports(req: Request, res: Response): Promise<void> {
  const decoded = auth(req);
  if (!isModerator(decoded)) { res.status(decoded?.email ? 403 : 401).json({ error: decoded?.email ? 'Moderator role required' : 'Authentication required' }); return; }
  const status = ['open', 'resolved', 'dismissed'].includes(String(req.query.status)) ? String(req.query.status) : 'open';
  try {
    if (isDbConfigured()) {
      const result = await dbQuery(`SELECT id, message_id, reporter_email, reason, status, created_at, resolved_at
                                    FROM community_message_reports WHERE status = $1 ORDER BY created_at DESC LIMIT 100`, [status]);
      res.status(200).json({ reports: result.rows });
      return;
    }
    res.status(200).json({ reports: inMemoryReports.filter((report) => report.status === status).slice(-100).reverse() });
  } catch (error) {
    console.error('[community-channels] reports failed', error);
    res.status(500).json({ error: 'Could not list reports' });
  }
}

export async function moderateMessage(req: Request, res: Response): Promise<void> {
  const decoded = auth(req);
  if (!isModerator(decoded)) { res.status(decoded?.email ? 403 : 401).json({ error: decoded?.email ? 'Moderator role required' : 'Authentication required' }); return; }
  const email = emailFrom(req) || 'moderator';
  const messageId = Number(req.params.id);
  const action = moderationAction(req.body?.action);
  const reason = safeReportReason(req.body?.reason);
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || !action) { res.status(400).json({ error: 'Valid message id and moderation action are required' }); return; }
  try {
    if (isDbConfigured()) {
      const moderatorId = await userIdForEmail(email);
      const status = action === 'remove' ? 'removed' : action === 'flag' ? 'flagged' : 'active';
      const updated = await dbQuery(`UPDATE community_messages SET status = $1, moderation_reason = CASE WHEN $1 = 'active' THEN NULL ELSE $2 END
                                     WHERE id = $3 RETURNING id, channel_id, status, moderation_reason, edited_at`, [status, reason || null, messageId]);
      if (!updated.rows?.[0]) { res.status(404).json({ error: 'Message not found' }); return; }
      await dbQuery(`INSERT INTO community_moderation_events(message_id, channel_id, actor_user_id, actor_email, action, reason)
                     VALUES($1,$2,$3,$4,$5,$6)`, [messageId, updated.rows[0].channel_id, moderatorId, email, action, reason || null]);
      res.status(200).json({ message: updated.rows[0], action });
      return;
    }
    const message = messageForId(messageId);
    if (!message) { res.status(404).json({ error: 'Message not found' }); return; }
    message.status = action === 'remove' ? 'removed' : action === 'flag' ? 'flagged' : 'active';
    message.moderation_reason = action === 'restore' ? null : reason || null;
    inMemoryModerationEvents.push({ messageId, channelId: message.channelId, actorEmail: email, action, reason, createdAt: new Date().toISOString() });
    res.status(200).json({ message, action });
  } catch (error) {
    console.error('[community-channels] moderation failed', error);
    res.status(500).json({ error: 'Could not moderate message' });
  }
}

export async function resolveReport(req: Request, res: Response): Promise<void> {
  const decoded = auth(req);
  if (!isModerator(decoded)) { res.status(decoded?.email ? 403 : 401).json({ error: decoded?.email ? 'Moderator role required' : 'Authentication required' }); return; }
  const reportId = Number(req.params.id);
  const status = req.body?.status === 'dismissed' ? 'dismissed' : req.body?.status === 'resolved' ? 'resolved' : null;
  if (!Number.isSafeInteger(reportId) || reportId <= 0 || !status) { res.status(400).json({ error: 'Valid report id and resolution status are required' }); return; }
  const email = emailFrom(req) || 'moderator';
  try {
    if (isDbConfigured()) {
      const moderatorId = await userIdForEmail(email);
      const updated = await dbQuery(`UPDATE community_message_reports SET status = $1, resolved_by_user_id = $2, resolved_at = now()
                                     WHERE id = $3 RETURNING id, message_id, status, resolved_at`, [status, moderatorId, reportId]);
      if (!updated.rows?.[0]) { res.status(404).json({ error: 'Report not found' }); return; }
      await dbQuery(`INSERT INTO community_moderation_events(message_id, actor_user_id, actor_email, action, reason, metadata)
                     SELECT message_id, $1, $2, $3, NULL, jsonb_build_object('reportId', id)
                     FROM community_message_reports WHERE id = $4`, [moderatorId, email, status === 'resolved' ? 'report_resolve' : 'report_dismiss', reportId]);
      res.status(200).json({ report: updated.rows[0] });
      return;
    }
    const report = inMemoryReports.find((item) => item.id === reportId);
    if (!report) { res.status(404).json({ error: 'Report not found' }); return; }
    report.status = status;
    report.resolvedAt = new Date().toISOString();
    inMemoryModerationEvents.push({ messageId: report.messageId, actorEmail: email, action: status === 'resolved' ? 'report_resolve' : 'report_dismiss', createdAt: report.resolvedAt });
    res.status(200).json({ report });
  } catch (error) {
    console.error('[community-channels] resolve report failed', error);
    res.status(500).json({ error: 'Could not resolve report' });
  }
}
