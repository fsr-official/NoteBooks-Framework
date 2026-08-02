import type { Request, Response } from 'express';
import { Resend } from 'resend';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

interface UserRecord {
  email: string;
  password: string;
  createdAt: string;
  passwordResetAt?: string;
}

interface ResetRecord {
  email: string;
  expiresAt: number;
}

export function assertAuthConfig() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required to start the server');
  }
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Initialize Redis client if available
let redis: any = null;

async function getRedisClient() {
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

// Helper to get user from Redis or memory
async function getUser(email: string): Promise<UserRecord | undefined> {
  const client = await getRedisClient();
  if (client) {
    return await client.get(`user:${email}`);
  }
  return users.get(email);
}

// Helper to set user in Redis or memory
async function setUser(email: string, userData: UserRecord) {
  const client = await getRedisClient();
  if (client) {
    await client.set(`user:${email}`, userData, { ex: 60 * 60 * 24 * 365 }); // 1 year
  } else {
    users.set(email, userData);
  }
}

// Helper to get reset token
async function getResetToken(token: string): Promise<string | undefined> {
  const client = await getRedisClient();
  if (client) {
    return await client.get(`reset:${token}`);
  }
  return resetTokens.get(token)?.email;
}

// Helper to set reset token
async function setResetToken(token: string, email: string, expiryMinutes = 15) {
  const client = await getRedisClient();
  if (client) {
    await client.set(`reset:${token}`, email, { ex: expiryMinutes * 60 });
  } else {
    resetTokens.set(token, { email, expiresAt: Date.now() + expiryMinutes * 60 * 1000 });
  }
}

// Helper to delete reset token
async function deleteResetToken(token: string) {
  const client = await getRedisClient();
  if (client) {
    await client.del(`reset:${token}`);
  } else {
    resetTokens.delete(token);
  }
}

// Helper to check password reset cooldown
async function checkResetCooldown(email: string) {
  const client = await getRedisClient();
  if (client) {
    const cooldown = await client.get(`reset_cooldown:${email}`);
    return !cooldown;
  }
  // For in-memory, just allow (would need better tracking)
  return true;
}

// Helper to set password reset cooldown
async function setResetCooldown(email: string) {
  const client = await getRedisClient();
  if (client) {
    await client.set(`reset_cooldown:${email}`, '1', { ex: 15 * 60 }); // 15 minutes
  }
}

// Verify reCAPTCHA token
async function verifyCaptcha(token?: string) {
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
    const { email, password, confirmPassword, captchaToken } = (req.body || {}) as Record<string, string | undefined>;

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
      createdAt: new Date().toISOString()
    };

    await setUser(email, user);

    // Generate JWT token
    const token = jwt.sign({ email }, getJwtSecret(), { expiresIn: '30d' });

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
    const { email, password, captchaToken } = (req.body || {}) as Record<string, string | undefined>;

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
    const token = jwt.sign({ email }, getJwtSecret(), { expiresIn: '30d' });

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
    const { email, captchaToken } = (req.body || {}) as Record<string, string | undefined>;

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
    const { token, newPassword, confirmPassword, captchaToken } = (req.body || {}) as Record<string, string | undefined>;

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
    let decoded;
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
