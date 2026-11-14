import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { getUser } from './auth.js';
import { validateBlocks, sanitizeBlocks } from '../lib/ai-markdown.js';
import { getRepoConfig, getStreamRepo, getSubjectRepo } from './_shared.js';

const inMemoryPosts: Array<any> = [];

function normalizeFeedItem(item: any, source = 'Community') {
  const created = item.created_at || item.createdAt || item.updated_at || new Date().toISOString();
  return { id: item.id || item.number || item.github_discussion_id, title: item.title || 'Untitled activity', source, url: item.url || item.html_url || '#', excerpt: String(item.body || item.excerpt || '').replace(/\s+/g, ' ').slice(0, 180), created_at: created, updated_at: item.updated_at || created, reply_count: item.reply_count ?? item.comments ?? null, reaction_count: item.reaction_count ?? item.reactions ?? null, status: item.status || item.state || null };
}
function rankFeed(items: any[], sort = 'latest') {
  return items.slice().sort((a, b) => {
    if (sort === 'trending') {
      const score = (item: any) => (Number(item.reply_count) || 0) * 3 + (Number(item.reaction_count) || 0) * 2 - Math.max(0, (Date.now() - new Date(item.updated_at || item.created_at).getTime()) / 86400000);
      return score(b) - score(a);
    }
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  });
}
export async function listFeed(req: Request, res: Response) {
  try {
    const sort = String(req.query.sort || 'latest');
    const source = String(req.query.source || 'community') === 'issues' ? 'Issues' : 'Community';
    const result = isDbConfigured() && source === 'Community' ? await dbQuery('SELECT id, title, body, subject, status, created_at, created_at AS updated_at FROM community_posts ORDER BY created_at DESC') : { rows: inMemoryPosts.slice().reverse() };
    return res.status(200).json({ items: rankFeed(result.rows.map((item: any) => normalizeFeedItem(item, source)), sort), sort, source });
  } catch (err) {
    console.error('[community] feed error', err);
    return res.status(500).json({ error: 'Live activity is unavailable' });
  }
}

export async function listPosts(req: Request, res: Response) {
  try {
    if (isDbConfigured()) {
      const r = await dbQuery('SELECT id, author_email, title, body, subject, status, github_discussion_id, created_at FROM community_posts ORDER BY created_at DESC');
      return res.status(200).json({ posts: r.rows });
    }
    return res.status(200).json({ posts: inMemoryPosts.slice().reverse() });
  } catch (err) {
    console.error('[community] list error', err);
    return res.status(500).json({ error: 'Failed to list posts' });
  }
}

export async function createPost(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const { title, body: content } = body as { title?: string; body?: string };
    const auth = (req as any).auth as { email?: string } | undefined;
    const email = auth?.email || body.authorEmail;
    const subject = (req.params && (req.params as any).subject) || req.query.subject || body.subject || undefined;
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    if (!title || !content) return res.status(400).json({ error: 'Missing title or body' });

    // Validate interactive AI-markdown blocks against allowlist
    const v = validateBlocks(content);
    if (!v.ok) return res.status(400).json({ error: 'Invalid interactive blocks', details: v.errors });

    // Sanitize interactive blocks to remove scripts/HTML before persisting/creating discussions
    const sanitized = sanitizeBlocks(content || '');
    const finalBody = sanitized.sanitized || content;

    if (isDbConfigured()) {
      const r = await dbQuery('INSERT INTO community_posts(author_email, title, body, subject) VALUES($1,$2,$3,$4) RETURNING id, author_email, title, body, status, github_discussion_id, subject, created_at', [email, title, finalBody, subject || null]);
      return res.status(201).json({ post: r.rows[0] });
    }

    const post = { id: inMemoryPosts.length + 1, author_email: email, title, body: finalBody, status: 'pending', github_discussion_id: null, subject: subject || null, created_at: new Date().toISOString() };
    inMemoryPosts.push(post);
    return res.status(201).json({ post });
  } catch (err) {
    console.error('[community] create error', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
}

export async function findPostById(id: number) {
  if (isDbConfigured()) {
    const r = await dbQuery('SELECT id, author_email, title, body, subject, status, github_discussion_id, created_at FROM community_posts WHERE id = $1', [id]);
    return r.rows[0];
  }
  return inMemoryPosts.find((p) => p.id === id);
}

export async function approvePost(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const post = await findPostById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    let prInfo: any = null;
    let merged = false;
    if (process.env.GITHUB_APP_AUTO_PR === 'true') {
      try {
        let owner: string | undefined;
        let repo: string | undefined;
        if (post.subject) {
          const subjRepo = await getSubjectRepo(post.subject);
          if (subjRepo) {
            owner = subjRepo.owner;
            repo = subjRepo.repo;
          }
        }
        if (!owner || !repo) {
          const repoCfg = await getRepoConfig();
          if (repoCfg) {
            owner = repoCfg.owner;
            repo = repoCfg.repo;
          }
        }
        if (owner && repo) {
          const gh = await import('../lib/github-app.js');
          const baseBranch = process.env.GITHUB_REPO_BASE || 'main';
          const branchName = `community/post-${id}-${Date.now()}`;
          const filePath = process.env.COMMUNITY_CONTENT_PATH || `community/posts/post-${id}.md`;
          const contentBase64 = Buffer.from(`# ${post.title}\n\n${post.body}\n`).toString('base64');
          const commitMessage = `Add community post: ${post.title}`;
          const prTitle = `Community post: ${post.title}`;
          const prBody = 'This PR adds a community post submitted through NoteBooks.';
          prInfo = await gh.createPrFromContent(owner, repo, baseBranch, branchName, filePath, contentBase64, commitMessage, prTitle, prBody);
          try {
            const logDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            fs.appendFileSync(path.join(logDir, 'admin-actions.log'), JSON.stringify({ at: new Date().toISOString(), action: 'create-pr', owner, repo, pr: prInfo.html_url || prInfo.url || prInfo.number }) + '\n');
          } catch (error) {
            console.error('[community] PR action log write failed', error);
          }
          if (process.env.GITHUB_APP_AUTO_MERGE === 'true') {
            try {
              const mergeMethod = (process.env.GITHUB_APP_AUTO_MERGE_METHOD as any) || 'merge';
              const prNumber = Number(prInfo.number || prInfo.id || 0);
              if (prNumber) {
                const mergeRes = await gh.mergePr(owner, repo, prNumber, mergeMethod);
                if (mergeRes) merged = true;
              }
            } catch (error) {
              console.error('[community] auto-merge failed', error);
            }
          }
        }
      } catch (error) {
        console.error('[community] create PR via GitHub App failed during approval', error);
      }
    }

    if (isDbConfigured()) {
      const communityTarget = await getStreamRepo('community');
      if (!communityTarget) return res.status(503).json({ error: 'Community repository is not configured' });
      const prNumber = prInfo && (prInfo.number || prInfo.id) ? Number(prInfo.number || prInfo.id) : null;
      const prUrl = prInfo && (prInfo.html_url || prInfo.url) ? (prInfo.html_url || prInfo.url) : null;
      const prBranch = prInfo && prInfo.head && prInfo.head.ref ? prInfo.head.ref : (prInfo && prInfo.head_ref) || null;
      const r = await dbQuery(
        `WITH approved AS (
           UPDATE community_posts
           SET status = 'approved', pr_number = $1, pr_url = $2, pr_branch = $3,
               pr_merged = $4, pr_merged_at = CASE WHEN $4 THEN now() ELSE pr_merged_at END
           WHERE id = $5
           RETURNING id, author_email, title, body, status, github_discussion_id,
                     pr_number, pr_url, pr_branch, pr_merged, pr_merged_at, created_at
         ),
         queued AS (
           INSERT INTO system_workflow_jobs(job_type, source_id, target_repository, dedupe_key)
           SELECT 'community_post', approved.id, $6, 'community-post:' || approved.id::text
           FROM approved
           ON CONFLICT (job_type, source_id) DO NOTHING
         )
         SELECT * FROM approved`,
        [prNumber, prUrl, prBranch, merged, id, `${communityTarget.owner}/${communityTarget.repo}`]
      );
      const out = { post: r.rows[0] as any, pr: prInfo, merged, delivery: { status: 'queued' } };
      return res.status(200).json(out);
    }

    const idx = inMemoryPosts.findIndex((p) => p.id === id);
    inMemoryPosts[idx].status = 'approved';
    inMemoryPosts[idx].github_discussion_id = null;
    inMemoryPosts[idx].pr = prInfo;
    inMemoryPosts[idx].merged = merged;
    inMemoryPosts[idx].pr_number = prInfo && (prInfo.number || prInfo.id) ? Number(prInfo.number || prInfo.id) : null;
    inMemoryPosts[idx].pr_url = prInfo && (prInfo.html_url || prInfo.url) ? (prInfo.html_url || prInfo.url) : null;
    inMemoryPosts[idx].pr_branch = prInfo && prInfo.head && prInfo.head.ref ? prInfo.head.ref : (prInfo && prInfo.head_ref) || null;
    inMemoryPosts[idx].pr_merged = merged;
    inMemoryPosts[idx].pr_merged_at = merged ? new Date().toISOString() : null;
    return res.status(200).json({ post: inMemoryPosts[idx] });
  } catch (err) {
    console.error('[community] approve error', err);
    return res.status(500).json({ error: 'Failed to approve post' });
  }
}

export async function rejectPost(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const post = await findPostById(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (isDbConfigured()) {
      const r = await dbQuery('UPDATE community_posts SET status = $1 WHERE id = $2 RETURNING id, author_email, title, body, status, github_discussion_id, created_at', ['rejected', id]);
      return res.status(200).json({ post: r.rows[0] });
    }

    const idx = inMemoryPosts.findIndex((p) => p.id === id);
    inMemoryPosts[idx].status = 'rejected';
    return res.status(200).json({ post: inMemoryPosts[idx] });
  } catch (err) {
    console.error('[community] reject error', err);
    return res.status(500).json({ error: 'Failed to reject post' });
  }
}

export default async function handler(req: Request, res: Response) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  switch (action) {
    case 'list':
      return listPosts(req, res);
    case 'create':
      return createPost(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}
