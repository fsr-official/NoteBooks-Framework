import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db';
import { getUser } from './auth';
import { validateBlocks, sanitizeBlocks } from '../lib/ai-markdown';
import { getOctokit } from './_shared';

const inMemoryPosts: Array<any> = [];

export async function listPosts(req: Request, res: Response) {
  try {
    if (isDbConfigured()) {
      const r = await dbQuery('SELECT id, author_email, title, body, status, github_discussion_id, created_at FROM community_posts ORDER BY created_at DESC');
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

    // Optionally create a GitHub Discussion when repo & token configured
    let discussionId: string | null = null;
    try {
      const communityRepo = process.env.GITHUB_COMMUNITY_REPO || process.env.GITHUB_REPO || '';
      if (communityRepo && (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT)) {
        const repoCfg = communityRepo.split('/');
        if (repoCfg.length === 2) {
          const octokit = await getOctokit({ allowUnauthenticated: false });
          const [owner, repo] = repoCfg;
          const discussionBody = subject ? `[${subject}]\n\n${finalBody}` : finalBody;
          const discussion = await octokit.rest.discussions.create({ owner, repo, title, body: discussionBody, category_name: 'Community' as any }).catch(() => null);
          if (discussion && discussion.data && discussion.data.html_url) {
            discussionId = String(discussion.data.id || discussion.data.node_id || discussion.data.html_url);
          }
        }
      }
    } catch (err) {
      console.warn('[community] GitHub discussion creation failed, continuing with local persistence', err);
    }

    if (isDbConfigured()) {
      const r = await dbQuery('INSERT INTO community_posts(author_email, title, body, github_discussion_id, subject) VALUES($1,$2,$3,$4,$5) RETURNING id, author_email, title, body, status, github_discussion_id, subject, created_at', [email, title, finalBody, discussionId, subject || null]);
      return res.status(201).json({ post: r.rows[0] });
    }

    const post = { id: inMemoryPosts.length + 1, author_email: email, title, body: finalBody, status: 'pending', github_discussion_id: discussionId, subject: subject || null, created_at: new Date().toISOString() };
    inMemoryPosts.push(post);
    return res.status(201).json({ post });
  } catch (err) {
    console.error('[community] create error', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
}

export async function findPostById(id: number) {
  if (isDbConfigured()) {
    const r = await dbQuery('SELECT id, author_email, title, body, status, github_discussion_id, created_at FROM community_posts WHERE id = $1', [id]);
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

    // create discussion if not present and GitHub configured
    let discussionId = post.github_discussion_id || null;
    let prInfo: any = null;
    let merged = false;
      try {
        const communityRepo = process.env.GITHUB_COMMUNITY_REPO || process.env.GITHUB_REPO || '';
        if (!discussionId && communityRepo) {
          const repoCfg = communityRepo.split('/');
          if (repoCfg.length === 2) {
            const [owner, repo] = repoCfg;
            try {
              const gh = await import('../lib/github-app');
              const discussionBody = post.subject ? `[${post.subject}]\n\n${post.body}` : post.body;
              const discussion = await gh.createDiscussionForRepo(owner, repo, post.title, discussionBody, 'Community');
              if (discussion) discussionId = String(discussion.id || discussion.node_id || discussion.html_url);
            } catch (err) {
              console.warn('[community] GitHub App discussion creation failed during approval', err);
            }
          }
        }
      // Optionally create a PR for the approved content using the GitHub App
      // Enable by setting GITHUB_APP_AUTO_PR=true and GITHUB_ISSUES_REPO=owner/repo
        if (process.env.GITHUB_APP_AUTO_PR === 'true') {
          // For content PRs, prefer subject-specific content repo if present
          let owner: string | undefined;
          let repo: string | undefined;
          if (post.subject) {
            const subjRepo = await import('./_shared').then((m) => m.getSubjectRepo(post.subject)).catch(() => null);
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
          try {
            const gh = await import('../lib/github-app');
            const baseBranch = process.env.GITHUB_REPO_BASE || 'main';
            const branchName = `community/post-${id}-${Date.now()}`;
            const filePath = process.env.COMMUNITY_CONTENT_PATH || `community/posts/post-${id}.md`;
            const contentBase64 = Buffer.from(`# ${post.title}\n\n${post.body}\n`).toString('base64');
            const commitMessage = `Add community post: ${post.title}`;
            const prTitle = `Community post: ${post.title}`;
            const prBody = `This PR adds a community post submitted by ${post.author_email || 'a contributor'}.`;
            const pr = await gh.createPrFromContent(owner, repo, baseBranch, branchName, filePath, contentBase64, commitMessage, prTitle, prBody).catch(() => null);
            if (pr) {
              prInfo = pr;
              try {
                const logDir = path.join(process.cwd(), 'logs');
                if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
                fs.appendFileSync(path.join(logDir, 'admin-actions.log'), JSON.stringify({ at: new Date().toISOString(), action: 'create-pr', owner, repo, pr: pr.html_url || pr.url || pr.number }) + '\n');
              } catch (e) {
                // ignore logging errors
              }
              // Optionally auto-merge if configured
              if (process.env.GITHUB_APP_AUTO_MERGE === 'true') {
                try {
                  const mergeMethod = (process.env.GITHUB_APP_AUTO_MERGE_METHOD as any) || 'merge';
                  const prNumber = Number((pr as any).number || (pr as any).id || 0);
                  if (prNumber) {
                    const mergeRes = await gh.mergePr(owner, repo, prNumber, mergeMethod).catch(() => null);
                    if (mergeRes) merged = true;
                  }
                } catch (err) {
                  console.warn('[community] auto-merge failed', err);
                }
              }
            }
          } catch (err) {
            console.warn('[community] create PR via GitHub App failed during approval', err);
          }
        }
      }
    } catch (err) {
      console.warn('[community] GitHub discussion creation failed during approval', err);
    }

    if (isDbConfigured()) {
      // Persist PR metadata when available; use NULLs when not set
      const prNumber = prInfo && (prInfo.number || prInfo.id) ? Number(prInfo.number || prInfo.id) : null;
      const prUrl = prInfo && (prInfo.html_url || prInfo.url) ? (prInfo.html_url || prInfo.url) : null;
      const prBranch = prInfo && prInfo.head && prInfo.head.ref ? prInfo.head.ref : (prInfo && prInfo.head_ref) || null;
      const prMergedAt = merged ? 'now()' : null;
      const r = await dbQuery(
        `UPDATE community_posts SET status = $1, github_discussion_id = $2, pr_number = $3, pr_url = $4, pr_branch = $5, pr_merged = $6, pr_merged_at = COALESCE($7::timestamptz, pr_merged_at) WHERE id = $8 RETURNING id, author_email, title, body, status, github_discussion_id, pr_number, pr_url, pr_branch, pr_merged, pr_merged_at, created_at`,
        ['approved', discussionId, prNumber, prUrl, prBranch, merged, prMergedAt, id]
      );
      const out = { post: r.rows[0] as any, pr: prInfo, merged };
      return res.status(200).json(out);
    }

    const idx = inMemoryPosts.findIndex((p) => p.id === id);
    inMemoryPosts[idx].status = 'approved';
    inMemoryPosts[idx].github_discussion_id = discussionId;
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
