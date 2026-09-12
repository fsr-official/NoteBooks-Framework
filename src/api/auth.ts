import type { Request, Response } from 'express';
import { Resend } from 'resend';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';

interface UserRecord {
  email: string;
  password: string;
  role: string;
  createdAt: string;
  passwordResetAt?: string;
}

interface ResetRecord {
  email: string;
  expiresAt: number;
}

interface AuthRequestBody {
  email?: string;
  password?: string;
  confirmPassword?: string;
  captchaToken?: string;
  token?: string;
  newPassword?: string;
}

export function assertAuthConfig() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required to start the server');
  }
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize Redis client if available
let redis: unknown = null;

async function getRedisClient(): Promise<any> {
  if (redis || !process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return redis;
  }

  const upstashRedis = await import('@upstash/redis');
  const createClient = (upstashRedis as { createClient?: (config: { url: string; token: string }) => any }).createClient;
  if (createClient) {
    redis = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }

  return redis;
}

// Fallback to in-memory storage if Redis is not available
const users = new Map<string, UserRecord>();
const resetTokens = new Map<string, ResetRecord>();

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function getJwtSecret(): string {
  assertAuthConfig();
  return process.env.JWT_SECRET as string;
}

function getAuthBody(req: Request): AuthRequestBody {
  return (req.body || {}) as AuthRequestBody;
}

function normalizeBackupCodes(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [value];
  } catch {
    return [value];
  }
}

// Helper to get user from Redis or memory
async function getUser(email: string): Promise<UserRecord | undefined> {
  if (isDbConfigured()) {
    try {
      const res = await dbQuery(`SELECT email, password_hash as password, role, totp_secret, backup_codes, created_at, password_reset_at,
        github_id, google_id, banned_until, display_name, bio, avatar_color, presence_status, presence_updated_at, profile_public
        FROM users WHERE email = $1`, [email]);
      if (res.rows.length) {
        const user = { ...res.rows[0] } as any;
        if (user.banned_until == null) delete user.banned_until;
        return user as UserRecord;
      }
      return undefined;
    } catch (err) {
      console.error('[auth][db] getUser error', err);
      return undefined;
    }
  }

  const client = await getRedisClient();
  if (client) {
    return await client.get(`user:${email}`);
  }
  return users.get(email);
}

// Helper to set user in Redis or memory
async function setUser(email: string, userData: UserRecord): Promise<void> {
  if (isDbConfigured()) {
    try {
      const data = userData as any;
      const backupCodes = normalizeBackupCodes(data.backup_codes);
      await dbQuery(`INSERT INTO users (email, password_hash, role, totp_secret, backup_codes, created_at, password_reset_at, github_id, google_id,
        banned_until, display_name, bio, avatar_color, presence_status, presence_updated_at, profile_public)
        VALUES ($1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
          totp_secret = EXCLUDED.totp_secret, backup_codes = EXCLUDED.backup_codes, password_reset_at = EXCLUDED.password_reset_at,
          github_id = EXCLUDED.github_id, google_id = EXCLUDED.google_id, banned_until = EXCLUDED.banned_until,
          display_name = EXCLUDED.display_name, bio = EXCLUDED.bio, avatar_color = EXCLUDED.avatar_color,
          presence_status = EXCLUDED.presence_status, presence_updated_at = EXCLUDED.presence_updated_at,
          profile_public = EXCLUDED.profile_public`,
        [email, data.password || data.password_hash, data.role, data.totp_secret ?? null, backupCodes,
          data.createdAt || new Date().toISOString(), data.passwordResetAt || null, data.github_id || null, data.google_id || null,
          data.banned_until ?? null, data.display_name ?? data.displayName ?? null, data.bio ?? '',
          data.avatar_color ?? data.avatarColor ?? '#21d4a5', data.presence_status ?? data.presenceStatus ?? 'online',
          data.presence_updated_at ?? data.presenceUpdatedAt ?? new Date().toISOString(), data.profile_public ?? data.profilePublic ?? true]);
      await dbQuery("INSERT INTO user_roles(user_id, role_key) SELECT id, 'verified_member' FROM users WHERE email = $1 ON CONFLICT (user_id, role_key) DO NOTHING", [email]).catch(() => {});
      return;
    } catch (err) {
      console.error('[auth][db] setUser error', err);
    }
  }

  const client = await getRedisClient();
  if (client) {
    await client.set(`user:${email}`, userData, { ex: 60 * 60 * 24 * 365 }); // 1 year
  } else {
    users.set(email, userData);
  }
}

async function getRoleKeys(email: string): Promise<string[]> {
  if (!isDbConfigured()) return [];
  try {
    const result = await dbQuery('SELECT role_key FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = $1 LIMIT 1) ORDER BY assigned_at ASC', [email]);
    return result.rows.map((row: any) => String(row.role_key));
  } catch {
    return [];
  }
}

// Exported helpers for other modules (fallback in-memory storage)
export { getUser, setUser, getRoleKeys };

// Helper to get reset token
async function getResetToken(token: string): Promise<string | undefined> {
  if (isDbConfigured()) {
    try {
      const res = await dbQuery('SELECT email FROM reset_tokens WHERE token = $1 AND expires_at > now()', [token]);
      if (res.rows.length) return res.rows[0].email;
      return undefined;
    } catch (err) {
      console.error('[auth][db] getResetToken error', err);
      return undefined;
    }
  }
  const client = await getRedisClient();
  if (client) {
    return await client.get(`reset:${token}`);
  }
  return resetTokens.get(token)?.email;
}

// Helper to set reset token
async function setResetToken(token: string, email: string, expiryMinutes = 15): Promise<void> {
  if (isDbConfigured()) {
    try {
      await dbQuery("INSERT INTO reset_tokens(token,email,expires_at) VALUES($1,$2, now() + ($3 * interval '1 minute') ) ON CONFLICT (token) DO UPDATE SET email = EXCLUDED.email, expires_at = EXCLUDED.expires_at", [token, email, expiryMinutes]);
      return;
    } catch (err) {
      console.error('[auth][db] setResetToken error', err);
    }
  }
  const client = await getRedisClient();
  if (client) {
    await client.set(`reset:${token}`, email, { ex: expiryMinutes * 60 });
  } else {
    resetTokens.set(token, { email, expiresAt: Date.now() + expiryMinutes * 60 * 1000 });
  }
}

// Helper to delete reset token
async function deleteResetToken(token: string): Promise<void> {
  if (isDbConfigured()) {
    try {
      await dbQuery('DELETE FROM reset_tokens WHERE token = $1', [token]);
      return;
    } catch (err) {
      console.error('[auth][db] deleteResetToken error', err);
    }
  }
  const client = await getRedisClient();
  if (client) {
    await client.del(`reset:${token}`);
  } else {
    resetTokens.delete(token);
  }
}

// Helper to check password reset cooldown
async function checkResetCooldown(email: string): Promise<boolean> {
  if (isDbConfigured()) {
    try {
      const res = await dbQuery('SELECT expires_at FROM reset_cooldowns WHERE email = $1 AND expires_at > now()', [email]);
      return res.rows.length === 0;
    } catch (err) {
      console.error('[auth][db] checkResetCooldown error', err);
      return true;
    }
  }
  const client = await getRedisClient();
  if (client) {
    const cooldown = await client.get(`reset_cooldown:${email}`);
    return !cooldown;
  }
  // For in-memory, just allow (would need better tracking)
  return true;
}

// Helper to set password reset cooldown
async function setResetCooldown(email: string): Promise<void> {
  if (isDbConfigured()) {
    try {
      await dbQuery("INSERT INTO reset_cooldowns(email,expires_at) VALUES($1, now() + (15 * interval '1 minute')) ON CONFLICT (email) DO UPDATE SET expires_at = EXCLUDED.expires_at", [email]);
      return;
    } catch (err) {
      console.error('[auth][db] setResetCooldown error', err);
    }
  }
  const client = await getRedisClient();
  if (client) {
    await client.set(`reset_cooldown:${email}`, '1', { ex: 15 * 60 }); // 15 minutes
  }
}

// Verify reCAPTCHA token
async function verifyCaptcha(token?: string): Promise<boolean> {
  if (!token || !RECAPTCHA_SECRET) {
    return true;
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET}&response=${token}`
    });
    const data = (await response.json()) as { success?: boolean; score?: number };
    return Boolean(data.success && data.score && data.score > 0.5);
  } catch (error) {
    console.error('[v0] reCAPTCHA verification error:', error);
    return false;
  }
}

// Register a new user
export async function handleRegister(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, confirmPassword, captchaToken } = getAuthBody(req);

    // Validate inputs
    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Verify CAPTCHA
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return res.status(400).json({ error: 'CAPTCHA verification failed' });
    }

    // Check if user already exists
    const existingUser = await getUser(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user: UserRecord = {
      email,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date().toISOString()
    };

    await setUser(email, user);

    // Generate JWT token
    const token = jwt.sign({ email }, getJwtSecret(), { expiresIn: '30d' });

    // Optionally set secure cookie
    if (process.env.USE_SESSION_COOKIE === 'true') {
      res.cookie('session', token, { httpOnly: true, secure: process.env.COOKIE_SECURE !== 'false', sameSite: 'strict', path: '/' });
    }

    return res.status(201).json({
      success: true,
      token,
      email,
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('[v0] Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

// Login user
export async function handleLogin(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, captchaToken } = getAuthBody(req);

    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    // Verify CAPTCHA
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return res.status(400).json({ error: 'CAPTCHA verification failed' });
    }

    // Get user
    const user = await getUser(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const roleKeys = await getRoleKeys(email);
    const token = jwt.sign({ email, role: user.role, roles: roleKeys }, getJwtSecret(), { expiresIn: '30d' });

    if (process.env.USE_SESSION_COOKIE === 'true') {
      res.cookie('session', token, { httpOnly: true, secure: process.env.COOKIE_SECURE !== 'false', sameSite: 'strict', path: '/' });
    }

    return res.status(200).json({
      success: true,
      token,
      email,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('[v0] Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}

// Request password reset
export async function handleForgotPassword(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, captchaToken } = getAuthBody(req);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Verify CAPTCHA
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return res.status(400).json({ error: 'CAPTCHA verification failed' });
    }

    // Check cooldown
    const canReset = await checkResetCooldown(email);
    if (!canReset) {
      return res.status(429).json({ error: 'Please wait 15 minutes before requesting another reset' });
    }

    // Check if user exists
    const user = await getUser(email);
    if (!user) {
      // Don't reveal if email exists, just pretend it worked
      return res.status(200).json({ success: true, message: 'If email exists, a reset link will be sent' });
    }

    // Generate reset token
    const resetToken = jwt.sign({ email, type: 'reset' }, getJwtSecret(), { expiresIn: '15m' });

    // Store reset token
    await setResetToken(resetToken, email, 15);

    // Set cooldown
    await setResetCooldown(email);

    // Send reset email
    const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

    try {
      if (!resend) {
        return res.status(200).json({ success: true, message: 'If email exists, a reset link will be sent' });
      }

      await resend.emails.send({
        from: 'noreply@resend.dev',
        to: email,
        subject: 'Reset your NoteBooks password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2>Password Reset Request</h2>
            <p>We received a request to reset the password for your NoteBooks account.</p>
            <p>Click the link below to reset your password (valid for 15 minutes):</p>
            <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
            <p>Or copy this link: ${resetLink}</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">This link expires in 15 minutes.</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('[v0] Email send error:', emailError);
      return res.status(500).json({ error: 'Failed to send reset email' });
    }

    return res.status(200).json({
      success: true,
      message: 'If email exists, a reset link will be sent'
    });
  } catch (error) {
    console.error('[v0] Forgot password error:', error);
    return res.status(500).json({ error: 'Failed to process password reset request' });
  }
}

// Reset password with token
export async function handleResetPassword(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token, newPassword, confirmPassword, captchaToken } = getAuthBody(req);

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify CAPTCHA
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
      return res.status(400).json({ error: 'CAPTCHA verification failed' });
    }

    // Verify and decode token
    let decoded: { email?: string; type?: string };
    try {
      decoded = jwt.verify(token, getJwtSecret()) as { email?: string; type?: string };
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (decoded.type !== 'reset') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Check if token exists in storage
    const storedEmail = await getResetToken(token);
    if (!storedEmail) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Get user
    if (!decoded.email) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const user = await getUser(decoded.email);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    user.password = hashedPassword;
    user.passwordResetAt = new Date().toISOString();
    await setUser(decoded.email, user);

    // Delete reset token
    await deleteResetToken(token);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('[v0] Reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}

// Export handler for API route
export default async function handler(req: Request, res: Response) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  switch (action) {
    case 'register':
      return handleRegister(req, res);
    case 'login':
      return handleLogin(req, res);
    case 'forgot-password':
      return handleForgotPassword(req, res);
    case 'reset-password':
      return handleResetPassword(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}
