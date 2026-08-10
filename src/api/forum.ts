import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

interface ForumCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  order: number;
  topicCount: number;
  lastActivityAt: string | null;
}

interface ForumTopic {
  id: string;
  title: string;
  body: string;
  categoryId: string;
  authorEmail: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  replyCount: number;
  isPinned: boolean;
  isLocked: boolean;
  tags: string[];
  lastReplyAt: string | null;
  lastReplyAuthor: string | null;
}

interface ForumReply {
  id: string;
  topicId: string;
  body: string;
  authorEmail: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  parentReplyId: string | null;
  quotedText: string | null;
}

interface ForumUserProfile {
  email: string;
  displayName: string;
  avatarColor: string;
  joinedAt: string;
  topicCount: number;
  replyCount: number;
  bio: string;
}

interface ReactionMap {
  [emoji: string]: string[];  // emoji → array of emails
}

interface ForumStats {
  totalTopics: number;
  totalReplies: number;
  totalUsers: number;
}

/* ────────────────────────────────────────────────────────────
   Redis helpers (mirrors auth.ts pattern)
   ──────────────────────────────────────────────────────────── */

let redis: any = null;

async function getRedisClient(): Promise<any> {
  if (redis) return redis;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;

  try {
    const upstashRedis = await import('@upstash/redis');
    const createClient = (upstashRedis as any).createClient;
    if (createClient) {
      redis = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
    }
  } catch {
    // Redis not available
  }
  return redis;
}

// In-memory fallback stores
const memCategories = new Map<string, ForumCategory>();
const memTopics = new Map<string, ForumTopic>();
const memReplies = new Map<string, ForumReply>();
const memProfiles = new Map<string, ForumUserProfile>();
const memReactions = new Map<string, ReactionMap>();
const memCategoryTopics = new Map<string, { id: string; score: number }[]>();
const memAllTopics: { id: string; score: number }[] = [];
const memTopicReplies = new Map<string, { id: string; score: number }[]>();
let memStats: ForumStats = { totalTopics: 0, totalReplies: 0, totalUsers: 0 };

function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/* ────────────────────────────────────────────────────────────
   Generic Redis/Memory CRUD
   ──────────────────────────────────────────────────────────── */

async function kvGet<T>(key: string, memMap: Map<string, T>): Promise<T | null> {
  const client = await getRedisClient();
  if (client) {
    const val = await client.get(key);
    return val as T | null;
  }
  return memMap.get(key) ?? null;
}

async function kvSet<T>(key: string, value: T, memMap: Map<string, T>, ttl?: number): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    if (ttl) {
      await client.set(key, JSON.stringify(value), { ex: ttl });
    } else {
      await client.set(key, JSON.stringify(value));
    }
  } else {
    memMap.set(key, value);
  }
}

async function kvDel(key: string, memMap: Map<string, any>): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.del(key);
  } else {
    memMap.delete(key);
  }
}

/** Sorted-set add (Redis ZADD / in-memory sorted array) */
async function sortedAdd(key: string, id: string, score: number, memList?: { id: string; score: number }[]): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.zadd(key, { score, member: id });
    return;
  }
  if (memList) {
    const existing = memList.findIndex((e) => e.id === id);
    if (existing !== -1) memList[existing].score = score;
    else memList.push({ id, score });
    memList.sort((a, b) => b.score - a.score);
  }
}

/** Sorted-set range (desc, newest first) */
async function sortedRange(key: string, start: number, end: number, memList?: { id: string; score: number }[]): Promise<string[]> {
  const client = await getRedisClient();
  if (client) {
    return (await client.zrange(key, start, end, { rev: true })) as string[];
  }
  if (memList) {
    return memList.slice(start, end + 1).map((e) => e.id);
  }
  return [];
}

/** Sorted-set count */
async function sortedCount(key: string, memList?: { id: string; score: number }[]): Promise<number> {
  const client = await getRedisClient();
  if (client) {
    return (await client.zcard(key)) as number;
  }
  return memList?.length ?? 0;
}

/** Sorted-set remove */
async function sortedRem(key: string, id: string, memList?: { id: string; score: number }[]): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.zrem(key, id);
    return;
  }
  if (memList) {
    const idx = memList.findIndex((e) => e.id === id);
    if (idx !== -1) memList.splice(idx, 1);
  }
}

/* ────────────────────────────────────────────────────────────
   JWT verification
   ──────────────────────────────────────────────────────────── */

function verifyToken(req: Request): { email: string; role?: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret) as { email?: string; role?: string };
    if (!decoded.email) return null;
    return { email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

function requireAuth(req: Request, res: Response): { email: string; role?: string } | null {
  const user = verifyToken(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

/* ────────────────────────────────────────────────────────────
   User profile helpers
   ──────────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

function emailToColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function emailToInitial(email: string): string {
  return (email[0] || 'U').toUpperCase();
}

function emailToDisplayName(email: string): string {
  const local = email.split('@')[0] || 'user';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

async function getOrCreateProfile(email: string): Promise<ForumUserProfile> {
  const key = `forum:user:${email}:profile`;
  const existing = await kvGet<ForumUserProfile>(key, memProfiles);
  if (existing) return existing;

  const profile: ForumUserProfile = {
    email,
    displayName: emailToDisplayName(email),
    avatarColor: emailToColor(email),
    joinedAt: new Date().toISOString(),
    topicCount: 0,
    replyCount: 0,
    bio: ''
  };
  await kvSet(key, profile, memProfiles);

  // Update stats
  const stats = await getStats();
  stats.totalUsers++;
  await setStats(stats);

  return profile;
}

async function getStats(): Promise<ForumStats> {
  const client = await getRedisClient();
  if (client) {
    const stats = await client.get('forum:stats');
    if (stats) return typeof stats === 'string' ? JSON.parse(stats) : stats as ForumStats;
  }
  return { ...memStats };
}

async function setStats(stats: ForumStats): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.set('forum:stats', JSON.stringify(stats));
  } else {
    memStats = stats;
  }
}

/* ────────────────────────────────────────────────────────────
   Default categories (seeded on first access)
   ──────────────────────────────────────────────────────────── */

const DEFAULT_CATEGORIES: Omit<ForumCategory, 'topicCount' | 'lastActivityAt'>[] = [
  { id: 'general',   name: 'General',   slug: 'general',   description: 'General discussions, introductions, and off-topic conversations', color: '#64748b', icon: '💬', order: 0 },
  { id: 'biology',   name: 'Biology',   slug: 'biology',   description: 'Discuss biology topics, share notes, and resolve doubts',            color: '#10b981', icon: '🧬', order: 1 },
  { id: 'chemistry', name: 'Chemistry', slug: 'chemistry', description: 'Chemistry discussions, reaction mechanisms, and problem solving',    color: '#3b82f6', icon: '⚗️', order: 2 },
  { id: 'physics',   name: 'Physics',   slug: 'physics',   description: 'Physics concepts, numerical problems, and exam preparation',         color: '#8b5cf6', icon: '⚛️', order: 3 },
  { id: 'geology',   name: 'Geology',   slug: 'geology',   description: 'Earth sciences, mineralogy, and geological phenomena',               color: '#f59e0b', icon: '🌍', order: 4 },
  { id: 'announcements', name: 'Announcements', slug: 'announcements', description: 'Official announcements from the Science Administration Department', color: '#ef4444', icon: '📢', order: 5 },
];

let categoriesSeeded = false;

async function seedCategories(): Promise<void> {
  if (categoriesSeeded) return;
  categoriesSeeded = true;

  for (const cat of DEFAULT_CATEGORIES) {
    const key = `forum:category:${cat.id}`;
    const existing = await kvGet<ForumCategory>(key, memCategories);
    if (!existing) {
      const category: ForumCategory = { ...cat, topicCount: 0, lastActivityAt: null };
      await kvSet(key, category, memCategories);
    }
  }
}

/* ────────────────────────────────────────────────────────────
   Route handlers
   ──────────────────────────────────────────────────────────── */

/** GET /api/forum/categories */
async function listCategories(_req: Request, res: Response) {
  await seedCategories();

  const categories: ForumCategory[] = [];
  for (const cat of DEFAULT_CATEGORIES) {
    const key = `forum:category:${cat.id}`;
    const data = await kvGet<ForumCategory>(key, memCategories);
    if (data) categories.push(data);
  }
  categories.sort((a, b) => a.order - b.order);

  res.json({ categories });
}

/** GET /api/forum/stats */
async function forumStats(_req: Request, res: Response) {
  const stats = await getStats();
  res.json(stats);
}

/** GET /api/forum/topics */
async function listTopics(req: Request, res: Response) {
  const categoryId = (req.query.category as string) || '';
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const sort = (req.query.sort as string) || 'latest';

  const start = (page - 1) * limit;
  const end = start + limit - 1;

  let listKey = 'forum:topics:latest';
  let memList = memAllTopics;

  if (categoryId) {
    listKey = `forum:category:${categoryId}:topics`;
    if (!memCategoryTopics.has(categoryId)) {
      memCategoryTopics.set(categoryId, []);
    }
    memList = memCategoryTopics.get(categoryId)!;
  }

  const total = await sortedCount(listKey, memList);
  const topicIds = await sortedRange(listKey, start, end, memList);

  const topics: ForumTopic[] = [];
  for (const id of topicIds) {
    const topic = await kvGet<ForumTopic>(`forum:topic:${id}`, memTopics);
    if (topic) topics.push(topic);
  }

  // Sort by pinned first, then by the requested sort
  topics.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (sort === 'popular') return b.replyCount - a.replyCount;
    if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    // 'latest' — default
    const aTime = a.lastReplyAt || a.createdAt;
    const bTime = b.lastReplyAt || b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  res.json({ topics, total, page, limit, hasMore: start + topics.length < total });
}

/** POST /api/forum/topics */
async function createTopic(req: Request, res: Response) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { title, body, categoryId, tags } = req.body as {
    title?: string; body?: string; categoryId?: string; tags?: string[];
  };

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!body?.trim()) return res.status(400).json({ error: 'Body is required' });
  if (title.trim().length < 5) return res.status(400).json({ error: 'Title must be at least 5 characters' });
  if (body.trim().length < 10) return res.status(400).json({ error: 'Body must be at least 10 characters' });

  await seedCategories();
  const catId = categoryId || 'general';
  const catKey = `forum:category:${catId}`;
  const category = await kvGet<ForumCategory>(catKey, memCategories);
  if (!category) return res.status(400).json({ error: 'Invalid category' });

  const profile = await getOrCreateProfile(user.email);
  const id = generateId();
  const now = new Date().toISOString();

  const topic: ForumTopic = {
    id,
    title: title.trim(),
    body: body.trim(),
    categoryId: catId,
    authorEmail: user.email,
    authorDisplayName: profile.displayName,
    createdAt: now,
    updatedAt: now,
    viewCount: 0,
    replyCount: 0,
    isPinned: false,
    isLocked: false,
    tags: (tags || []).slice(0, 5).map((t) => t.trim().toLowerCase()).filter(Boolean),
    lastReplyAt: null,
    lastReplyAuthor: null
  };

  await kvSet(`forum:topic:${id}`, topic, memTopics);

  // Add to sorted sets
  const score = Date.now();
  if (!memCategoryTopics.has(catId)) memCategoryTopics.set(catId, []);
  await sortedAdd(`forum:category:${catId}:topics`, id, score, memCategoryTopics.get(catId));
  await sortedAdd('forum:topics:latest', id, score, memAllTopics);

  // Update category
  category.topicCount++;
  category.lastActivityAt = now;
  await kvSet(catKey, category, memCategories);

  // Update profile
  profile.topicCount++;
  await kvSet(`forum:user:${user.email}:profile`, profile, memProfiles);

  // Update stats
  const stats = await getStats();
  stats.totalTopics++;
  await setStats(stats);

  res.status(201).json({ topic });
}

/** GET /api/forum/topics/:id */
async function getTopic(req: Request, res: Response) {
  const id = req.params.id as string;
  const topic = await kvGet<ForumTopic>(`forum:topic:${id}`, memTopics);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  // Increment view count
  topic.viewCount++;
  await kvSet(`forum:topic:${id}`, topic, memTopics);

  // Get replies
  if (!memTopicReplies.has(id)) memTopicReplies.set(id, []);
  const replyIds = await sortedRange(`forum:topic:${id}:replies`, 0, 999, memTopicReplies.get(id));
  const replies: ForumReply[] = [];
  for (const rid of replyIds) {
    const reply = await kvGet<ForumReply>(`forum:reply:${rid}`, memReplies);
    if (reply) replies.push(reply);
  }

  // Sort replies chronologically (oldest first for thread readability)
  replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Get reactions for the topic
  const topicReactions = await getReactions('topic', id);

  // Get reactions for each reply
  const replyReactions: Record<string, ReactionMap> = {};
  for (const r of replies) {
    replyReactions[r.id] = await getReactions('reply', r.id);
  }

  // Get author profile
  const authorProfile = await getOrCreateProfile(topic.authorEmail);

  res.json({
    topic,
    replies,
    topicReactions,
    replyReactions,
    authorProfile
  });
}

/** POST /api/forum/topics/:id/reply */
async function createReply(req: Request, res: Response) {
  const user = requireAuth(req, res);
  if (!user) return;

  const topicId = req.params.id as string;
  const { body, parentReplyId, quotedText } = req.body as {
    body?: string; parentReplyId?: string; quotedText?: string;
  };

  if (!body?.trim()) return res.status(400).json({ error: 'Reply body is required' });
  if (body.trim().length < 2) return res.status(400).json({ error: 'Reply must be at least 2 characters' });

  const topic = await kvGet<ForumTopic>(`forum:topic:${topicId}`, memTopics);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  if (topic.isLocked) return res.status(403).json({ error: 'This topic is locked' });

  const profile = await getOrCreateProfile(user.email);
  const id = generateId();
  const now = new Date().toISOString();

  const reply: ForumReply = {
    id,
    topicId,
    body: body.trim(),
    authorEmail: user.email,
    authorDisplayName: profile.displayName,
    createdAt: now,
    updatedAt: now,
    parentReplyId: parentReplyId || null,
    quotedText: quotedText || null
  };

  await kvSet(`forum:reply:${id}`, reply, memReplies);

  // Add to topic's reply sorted set
  if (!memTopicReplies.has(topicId)) memTopicReplies.set(topicId, []);
  await sortedAdd(`forum:topic:${topicId}:replies`, id, Date.now(), memTopicReplies.get(topicId));

  // Update topic metadata
  topic.replyCount++;
  topic.lastReplyAt = now;
  topic.lastReplyAuthor = profile.displayName;
  topic.updatedAt = now;
  await kvSet(`forum:topic:${topicId}`, topic, memTopics);

  // Bump topic in sorted sets
  const score = Date.now();
  if (!memCategoryTopics.has(topic.categoryId)) memCategoryTopics.set(topic.categoryId, []);
  await sortedAdd(`forum:category:${topic.categoryId}:topics`, topicId, score, memCategoryTopics.get(topic.categoryId));
  await sortedAdd('forum:topics:latest', topicId, score, memAllTopics);

  // Update category last activity
  const catKey = `forum:category:${topic.categoryId}`;
  const category = await kvGet<ForumCategory>(catKey, memCategories);
  if (category) {
    category.lastActivityAt = now;
    await kvSet(catKey, category, memCategories);
  }

  // Update profile
  profile.replyCount++;
  await kvSet(`forum:user:${user.email}:profile`, profile, memProfiles);

  // Update stats
  const stats = await getStats();
  stats.totalReplies++;
  await setStats(stats);

  res.status(201).json({ reply });
}

/* ────────────────────────────────────────────────────────────
   Reactions
   ──────────────────────────────────────────────────────────── */

const ALLOWED_EMOJIS = ['👍', '❤️', '🎓', '💡', '🔥'];

async function getReactions(targetType: string, targetId: string): Promise<ReactionMap> {
  const key = `forum:reactions:${targetType}:${targetId}`;
  const existing = await kvGet<ReactionMap>(key, memReactions);
  return existing || {};
}

async function setReactions(targetType: string, targetId: string, reactions: ReactionMap): Promise<void> {
  const key = `forum:reactions:${targetType}:${targetId}`;
  await kvSet(key, reactions, memReactions);
}

/** POST /api/forum/react */
async function toggleReaction(req: Request, res: Response) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { targetType, targetId, emoji } = req.body as {
    targetType?: string; targetId?: string; emoji?: string;
  };

  if (!targetType || !targetId || !emoji) {
    return res.status(400).json({ error: 'Missing targetType, targetId, or emoji' });
  }

  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return res.status(400).json({ error: 'Invalid emoji reaction' });
  }

  if (targetType !== 'topic' && targetType !== 'reply') {
    return res.status(400).json({ error: 'targetType must be "topic" or "reply"' });
  }

  const reactions = await getReactions(targetType, targetId);
  if (!reactions[emoji]) reactions[emoji] = [];

  const idx = reactions[emoji].indexOf(user.email);
  if (idx === -1) {
    reactions[emoji].push(user.email);
  } else {
    reactions[emoji].splice(idx, 1);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  }

  await setReactions(targetType, targetId, reactions);

  res.json({ reactions });
}

/* ────────────────────────────────────────────────────────────
   User profiles
   ──────────────────────────────────────────────────────────── */

/** GET /api/forum/users/:email */
async function getUserProfile(req: Request, res: Response) {
  const email = req.params.email as string;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const profile = await getOrCreateProfile(email);

  // Return safe public profile (no raw email for privacy unless it's the user themselves)
  const viewer = verifyToken(req);
  const isOwn = viewer?.email === email;

  res.json({
    displayName: profile.displayName,
    avatarColor: profile.avatarColor,
    initial: emailToInitial(email),
    joinedAt: profile.joinedAt,
    topicCount: profile.topicCount,
    replyCount: profile.replyCount,
    bio: profile.bio,
    email: isOwn ? email : undefined
  });
}

/** PUT /api/forum/profile */
async function updateProfile(req: Request, res: Response) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { displayName, bio } = req.body as { displayName?: string; bio?: string };

  const profile = await getOrCreateProfile(user.email);

  if (displayName?.trim()) {
    const name = displayName.trim();
    if (name.length < 2 || name.length > 30) {
      return res.status(400).json({ error: 'Display name must be 2-30 characters' });
    }
    profile.displayName = name;
  }

  if (bio !== undefined) {
    profile.bio = (bio || '').slice(0, 200);
  }

  await kvSet(`forum:user:${user.email}:profile`, profile, memProfiles);

  res.json({ profile });
}

/* ────────────────────────────────────────────────────────────
   Search
   ──────────────────────────────────────────────────────────── */

/** GET /api/forum/search?q=... */
async function searchTopics(req: Request, res: Response) {
  const query = ((req.query.q as string) || '').trim().toLowerCase();
  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  const limit = Math.min(30, parseInt(req.query.limit as string, 10) || 15);

  // Get all topic IDs
  const allIds = await sortedRange('forum:topics:latest', 0, 999, memAllTopics);
  const results: ForumTopic[] = [];

  for (const id of allIds) {
    if (results.length >= limit) break;
    const topic = await kvGet<ForumTopic>(`forum:topic:${id}`, memTopics);
    if (!topic) continue;

    const titleMatch = topic.title.toLowerCase().includes(query);
    const bodyMatch = topic.body.toLowerCase().includes(query);
    const tagMatch = topic.tags.some((t) => t.includes(query));

    if (titleMatch || bodyMatch || tagMatch) {
      results.push(topic);
    }
  }

  res.json({ results, query, total: results.length });
}

/* ────────────────────────────────────────────────────────────
   Moderation (admin only)
   ──────────────────────────────────────────────────────────── */

function isAdmin(req: Request): boolean {
  const user = verifyToken(req);
  return user?.role === 'admin' || user?.role === 'superadmin';
}

/** DELETE /api/forum/topics/:id */
async function deleteTopic(req: Request, res: Response) {
  if (!isAdmin(req)) {
    // Also allow the topic author to delete their own topic
    const user = verifyToken(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    
    const topic = await kvGet<ForumTopic>(`forum:topic:${req.params.id as string}`, memTopics);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.authorEmail !== user.email) return res.status(403).json({ error: 'Admin access required' });
  }

  const id = req.params.id as string;
  const topic = await kvGet<ForumTopic>(`forum:topic:${id}`, memTopics);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  // Remove from sorted sets
  if (!memCategoryTopics.has(topic.categoryId)) memCategoryTopics.set(topic.categoryId, []);
  await sortedRem(`forum:category:${topic.categoryId}:topics`, id, memCategoryTopics.get(topic.categoryId));
  await sortedRem('forum:topics:latest', id, memAllTopics);

  // Remove all replies
  if (!memTopicReplies.has(id)) memTopicReplies.set(id, []);
  const replyIds = await sortedRange(`forum:topic:${id}:replies`, 0, 999, memTopicReplies.get(id));
  for (const rid of replyIds) {
    await kvDel(`forum:reply:${rid}`, memReplies);
  }

  // Remove topic
  await kvDel(`forum:topic:${id}`, memTopics);

  // Update category count
  const catKey = `forum:category:${topic.categoryId}`;
  const category = await kvGet<ForumCategory>(catKey, memCategories);
  if (category) {
    category.topicCount = Math.max(0, category.topicCount - 1);
    await kvSet(catKey, category, memCategories);
  }

  // Update stats
  const stats = await getStats();
  stats.totalTopics = Math.max(0, stats.totalTopics - 1);
  stats.totalReplies = Math.max(0, stats.totalReplies - topic.replyCount);
  await setStats(stats);

  res.json({ success: true, message: 'Topic deleted' });
}

/** DELETE /api/forum/replies/:id */
async function deleteReply(req: Request, res: Response) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const id = req.params.id as string;
  const reply = await kvGet<ForumReply>(`forum:reply:${id}`, memReplies);
  if (!reply) return res.status(404).json({ error: 'Reply not found' });

  // Allow admin or author
  if (!isAdmin(req) && reply.authorEmail !== user.email) {
    return res.status(403).json({ error: 'Not authorized to delete this reply' });
  }

  // Remove from topic's sorted set
  if (!memTopicReplies.has(reply.topicId)) memTopicReplies.set(reply.topicId, []);
  await sortedRem(`forum:topic:${reply.topicId}:replies`, id, memTopicReplies.get(reply.topicId));

  // Remove reply
  await kvDel(`forum:reply:${id}`, memReplies);

  // Update topic reply count
  const topic = await kvGet<ForumTopic>(`forum:topic:${reply.topicId}`, memTopics);
  if (topic) {
    topic.replyCount = Math.max(0, topic.replyCount - 1);
    await kvSet(`forum:topic:${reply.topicId}`, topic, memTopics);
  }

  // Update stats
  const stats = await getStats();
  stats.totalReplies = Math.max(0, stats.totalReplies - 1);
  await setStats(stats);

  res.json({ success: true, message: 'Reply deleted' });
}

/** POST /api/forum/topics/:id/pin */
async function togglePin(req: Request, res: Response) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

  const id = req.params.id as string;
  const topic = await kvGet<ForumTopic>(`forum:topic:${id}`, memTopics);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  topic.isPinned = !topic.isPinned;
  await kvSet(`forum:topic:${id}`, topic, memTopics);

  res.json({ topic });
}

/** POST /api/forum/topics/:id/lock */
async function toggleLock(req: Request, res: Response) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });

  const id = req.params.id as string;
  const topic = await kvGet<ForumTopic>(`forum:topic:${id}`, memTopics);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  topic.isLocked = !topic.isLocked;
  await kvSet(`forum:topic:${id}`, topic, memTopics);

  res.json({ topic });
}

/* ────────────────────────────────────────────────────────────
   Router
   ──────────────────────────────────────────────────────────── */

export function createForumRouter(): Router {
  const router = createRouter();

  // Categories
  router.get('/categories', listCategories);

  // Topics
  router.get('/topics', listTopics);
  router.post('/topics', createTopic);
  router.get('/topics/:id', getTopic);

  // Replies
  router.post('/topics/:id/reply', createReply);

  // Reactions
  router.post('/react', toggleReaction);

  // User profiles
  router.get('/users/:email', getUserProfile);
  router.put('/profile', updateProfile);

  // Search
  router.get('/search', searchTopics);

  // Stats
  router.get('/stats', forumStats);

  // Moderation
  router.delete('/topics/:id', deleteTopic);
  router.delete('/replies/:id', deleteReply);
  router.post('/topics/:id/pin', togglePin);
  router.post('/topics/:id/lock', toggleLock);

  return router;
}

export default createForumRouter;
