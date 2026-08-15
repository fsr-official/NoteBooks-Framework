import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getUser as getMemoryUser, setUser as setMemoryUser } from './auth';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';

function getJwtSecret(): string {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  return process.env.JWT_SECRET;
}

async function findOrCreateUserByEmail(email: string, provider: string, providerId: string) {
  if (isDbConfigured()) {
    const res = await dbQuery('SELECT id, email, role FROM users WHERE email = $1', [email]);
    if (res.rows.length) {
      // update provider id if missing
      await dbQuery(`UPDATE users SET ${provider}_id = $1 WHERE email = $2`, [providerId, email]);
      return res.rows[0];
    }

    const randomPw = Math.random().toString(36);
    const hash = await bcrypt.hash(randomPw, 10);
    const insert = await dbQuery(
      `INSERT INTO users (email, password_hash, role, ${provider}_id) VALUES ($1, $2, 'user', $3) RETURNING id, email, role`,
      [email, hash, providerId]
    );
    return insert.rows[0];
  }

  // In-memory fallback
  const existing = await getMemoryUser(email);
  if (existing) {
    (existing as any)[`${provider}_id`] = providerId;
    await setMemoryUser(email, existing as any);
    return { email: existing.email, role: existing.role };
  }
  const hashed = await bcrypt.hash(Math.random().toString(36), 10);
  const user = { email, password: hashed, role: 'user', createdAt: new Date().toISOString() } as any;
  user[`${provider}_id`] = providerId;
  await setMemoryUser(email, user);
  return { email, role: 'user' };
}

async function exchangeGitHub(code: string) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GitHub OAuth not configured');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
  });
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) throw new Error('Failed to obtain GitHub access token');

  const userRes = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${accessToken}`, Accept: 'application/json' } });
  const profile = await userRes.json();

  // try to fetch primary email
  let email = profile.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', { headers: { Authorization: `token ${accessToken}`, Accept: 'application/json' } });
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails) && emails.find((e: any) => e.primary) || emails[0];
    email = primary?.email;
  }

  return { email, providerId: String(profile.id), profile };
}

async function exchangeGoogle(code: string, redirectUri?: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');

  const params = new URLSearchParams();
  params.set('code', code);
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  params.set('grant_type', 'authorization_code');
  if (redirectUri) params.set('redirect_uri', redirectUri);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) throw new Error('Failed to obtain Google access token');

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  const profile = await userRes.json();
  const email = profile.email;
  return { email, providerId: profile.id, profile };
}

export default async function handler(req: Request, res: Response) {
  const action = String(req.query.action || '');
  try {
    if (action === 'github') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { code } = req.body || {};
      if (!code) return res.status(400).json({ error: 'Missing code' });
      const { email, providerId } = await exchangeGitHub(code);
      if (!email) return res.status(400).json({ error: 'GitHub account has no email' });

      // linking vs sign-in
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        // link to existing account
        const token = authHeader.slice(7);
        const payload: any = jwt.verify(token, getJwtSecret());
        if (!payload?.email) return res.status(401).json({ error: 'Invalid token' });
        // update provider id on that account
        await findOrCreateUserByEmail(payload.email, 'github', providerId);
        return res.json({ success: true, linked: true });
      }

      const user = await findOrCreateUserByEmail(email, 'github', providerId);
      const token = jwt.sign({ email: user.email, role: user.role }, getJwtSecret(), { expiresIn: '30d' });
      return res.json({ success: true, token, email: user.email });
    }

    if (action === 'google') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { code, redirect_uri } = req.body || {};
      if (!code) return res.status(400).json({ error: 'Missing code' });
      const { email, providerId } = await exchangeGoogle(code, redirect_uri);
      if (!email) return res.status(400).json({ error: 'Google account has no email' });

      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload: any = jwt.verify(token, getJwtSecret());
        if (!payload?.email) return res.status(401).json({ error: 'Invalid token' });
        await findOrCreateUserByEmail(payload.email, 'google', providerId);
        return res.json({ success: true, linked: true });
      }

      const user = await findOrCreateUserByEmail(email, 'google', providerId);
      const token = jwt.sign({ email: user.email, role: user.role }, getJwtSecret(), { expiresIn: '30d' });
      return res.json({ success: true, token, email: user.email });
    }

    return res.status(404).json({ error: 'Action not found' });
  } catch (err: any) {
    console.error('[oauth] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
