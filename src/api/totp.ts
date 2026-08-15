import type { Request, Response } from 'express';
import { authenticator } from 'otplib';
import { getUser, setUser } from './auth';

function generateBackupCodes(count = 8) {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8-digit numeric codes
    codes.push(Math.floor(10000000 + Math.random() * 90000000).toString());
  }
  return codes;
}

export async function generateTotpSecretForEmail(email: string) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, 'NoteBooks', secret);
  return { secret, otpauth };
}

export async function verifyTotpForEmail(email: string, token: string): Promise<boolean> {
  const user = await getUser(email);
  if (!user || !(user as any).totp_secret) return false;
  return authenticator.check(token, (user as any).totp_secret);
}

export async function enrollTotp(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { secret, otpauth } = await generateTotpSecretForEmail(email);
    // Return secret to client for verification step; don't persist yet
    return res.status(200).json({ secret, otpauth });
  } catch (err) {
    console.error('[totp] enroll error', err);
    return res.status(500).json({ error: 'Failed to generate TOTP secret' });
  }
}

export async function verifyAndEnableTotp(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, secret, token } = req.body || {};
    if (!email || !secret || !token) return res.status(400).json({ error: 'Missing required fields' });

    const valid = authenticator.check(token, secret);
    if (!valid) return res.status(400).json({ error: 'Invalid token' });

    const user = await getUser(email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    (user as any).totp_secret = secret;
    const backupCodes = generateBackupCodes();
    (user as any).backup_codes = JSON.stringify(backupCodes);

    await setUser(email, user as any);

    return res.status(200).json({ success: true, backupCodes });
  } catch (err) {
    console.error('[totp] verify enable error', err);
    return res.status(500).json({ error: 'Failed to enable TOTP' });
  }
}

export async function disableTotp(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await getUser(email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    (user as any).totp_secret = null;
    (user as any).backup_codes = null;
    await setUser(email, user as any);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[totp] disable error', err);
    return res.status(500).json({ error: 'Failed to disable TOTP' });
  }
}

export default async function handler(req: Request, res: Response) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  switch (action) {
    case 'enroll':
      return enrollTotp(req, res);
    case 'verify-enable':
      return verifyAndEnableTotp(req, res);
    case 'disable':
      return disableTotp(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}
