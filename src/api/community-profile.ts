import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { getUser, setUser } from './auth.js';
import { isPresenceStatus, ROLE_LABELS, isRoleKey, type PresenceStatus, type RoleKey } from '../lib/roles.js';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function safeProfile(user: any, roles: RoleKey[], own = false) {
  const email = normalizeEmail(user.email);
  return {
    email: own ? email : undefined,
    displayName: String(user.display_name || user.displayName || email.split('@')[0] || 'Member').slice(0, 60),
    bio: String(user.bio || '').slice(0, 240),
    avatarColor: String(user.avatar_color || user.avatarColor || '#21d4a5').slice(0, 32),
    presence: isPresenceStatus(user.presence_status || user.presenceStatus) ? (user.presence_status || user.presenceStatus) : 'online',
    presenceUpdatedAt: user.presence_updated_at || user.presenceUpdatedAt || null,
    roles: roles.map((key) => ({ key, label: ROLE_LABELS[key] })),
    profilePublic: user.profile_public !== false && user.profilePublic !== false,
  };
}

async function roleKeysForUser(userId: number | null, user: any): Promise<RoleKey[]> {
  if (isDbConfigured() && userId) {
    try {
      const result = await dbQuery('SELECT role_key FROM user_roles WHERE user_id = $1 ORDER BY assigned_at ASC', [userId]);
      const roles = result.rows.map((row: any) => row.role_key).filter(isRoleKey);
      if (roles.length) return roles;
    } catch (error) {
      console.warn('[community-profile] role lookup unavailable', error);
    }
  }
  const fallback = Array.isArray(user.role_keys) ? user.role_keys.filter(isRoleKey) : [];
  if (fallback.length) return fallback;
  if (String(user.role) === 'admin') return ['super_admin'];
  return ['verified_member'];
}

async function loadProfile(email: string) {
  if (isDbConfigured()) {
    const result = await dbQuery(
      'SELECT id, email, display_name, bio, avatar_color, presence_status, presence_updated_at, profile_public, role FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
    const user = result.rows?.[0];
    if (!user) return null;
    return { user, roles: await roleKeysForUser(Number(user.id), user) };
  }
  const user = await getUser(email);
  return user ? { user, roles: await roleKeysForUser(null, user) } : null;
}

export async function getOwnProfile(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail((req as any).auth?.email);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  try {
    const profile = await loadProfile(email);
    if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.status(200).json({ profile: safeProfile(profile.user, profile.roles, true) });
  } catch (error) {
    console.error('[community-profile] own profile failed', error);
    res.status(500).json({ error: 'Could not load profile' });
  }
}

export async function getPublicProfile(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail(decodeURIComponent(String(req.params.email || '')));
  if (!email || !email.includes('@')) { res.status(400).json({ error: 'Valid email is required' }); return; }
  try {
    const profile = await loadProfile(email);
    if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
    const viewerEmail = normalizeEmail((req as any).auth?.email);
    const isPublic = profile.user.profile_public !== false && profile.user.profilePublic !== false;
    if (!isPublic && viewerEmail !== email) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.status(200).json({ profile: safeProfile(profile.user, profile.roles, viewerEmail === email) });
  } catch (error) {
    console.error('[community-profile] public profile failed', error);
    res.status(500).json({ error: 'Could not load profile' });
  }
}

export async function listPublicProfiles(req: Request, res: Response): Promise<void> {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
  try {
    if (!isDbConfigured()) { res.status(200).json({ profiles: [] }); return; }
    const result = await dbQuery(
      'SELECT id, email, display_name, bio, avatar_color, presence_status, presence_updated_at, profile_public, role FROM users WHERE profile_public = true ORDER BY COALESCE(display_name, email) ASC LIMIT $1',
      [limit],
    );
    const profiles = await Promise.all(result.rows.map(async (user: any) => safeProfile(user, await roleKeysForUser(Number(user.id), user))));
    res.status(200).json({ profiles });
  } catch (error) {
    console.error('[community-profile] profile list failed', error);
    res.status(500).json({ error: 'Could not list profiles' });
  }
}

export async function updateOwnProfile(req: Request, res: Response): Promise<void> {
  const email = normalizeEmail((req as any).auth?.email);
  if (!email) { res.status(401).json({ error: 'Authentication required' }); return; }
  const displayName = String(req.body?.displayName ?? '').trim();
  const bio = String(req.body?.bio ?? '').slice(0, 240);
  const avatarColor = String(req.body?.avatarColor ?? '').trim();
  const presence = req.body?.presence;
  const profilePublic = req.body?.profilePublic;
  if (displayName && (displayName.length < 2 || displayName.length > 60)) { res.status(400).json({ error: 'Display name must be 2-60 characters' }); return; }
  if (avatarColor && !/^#[0-9a-f]{6}$/i.test(avatarColor)) { res.status(400).json({ error: 'Avatar color must be a six-digit hex color' }); return; }
  if (presence !== undefined && !isPresenceStatus(presence)) { res.status(400).json({ error: 'Presence must be online or dnd' }); return; }
  if (profilePublic !== undefined && typeof profilePublic !== 'boolean') { res.status(400).json({ error: 'profilePublic must be boolean' }); return; }
  try {
    if (isDbConfigured()) {
      const result = await dbQuery(
        `UPDATE users SET display_name = COALESCE(NULLIF($1, ''), display_name), bio = $2,
         avatar_color = COALESCE(NULLIF($3, ''), avatar_color),
         presence_status = COALESCE($4, presence_status),
         presence_updated_at = CASE WHEN $4 IS NULL THEN presence_updated_at ELSE now() END,
         profile_public = COALESCE($5, profile_public)
         WHERE email = $6
         RETURNING id, email, display_name, bio, avatar_color, presence_status, presence_updated_at, profile_public, role`,
        [displayName, bio, avatarColor, presence === undefined ? null : presence, profilePublic === undefined ? null : profilePublic, email],
      );
      if (!result.rows?.[0]) { res.status(404).json({ error: 'Profile not found' }); return; }
      const user = result.rows[0];
      res.status(200).json({ profile: safeProfile(user, await roleKeysForUser(Number(user.id), user), true) });
      return;
    }
    const user: any = await getUser(email);
    if (!user) { res.status(404).json({ error: 'Profile not found' }); return; }
    if (displayName) user.displayName = displayName;
    user.bio = bio;
    if (avatarColor) user.avatarColor = avatarColor;
    if (presence !== undefined) { user.presenceStatus = presence as PresenceStatus; user.presenceUpdatedAt = new Date().toISOString(); }
    if (profilePublic !== undefined) user.profilePublic = profilePublic;
    await setUser(email, user);
    res.status(200).json({ profile: safeProfile(user, await roleKeysForUser(null, user), true) });
  } catch (error) {
    console.error('[community-profile] update failed', error);
    res.status(500).json({ error: 'Could not update profile' });
  }
}
