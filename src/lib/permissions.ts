import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUser } from '../api/auth.js';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production';
}

export function parseAuthToken(req: Request) {
  const header = req.headers.authorization;
  if (!header) return null;
  const headerStr = String(header || '');
  const [scheme, token] = headerStr.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  try {
    return jwt.verify(token, getJwtSecret()) as any;
  } catch (err) {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Authorization header missing or malformed' });
  const decoded = parseAuthToken(req);
  if (!decoded || !decoded.email) return res.status(401).json({ error: 'Unauthorized' });
  (req as any).auth = decoded;
  next();
}

export async function requireTotpEnrolled(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Authorization header missing or malformed' });
  const decoded = parseAuthToken(req);
  if (!decoded || !decoded.email) return res.status(401).json({ error: 'Unauthorized' });
  const user = await getUser(decoded.email);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!(user as any).totp_secret) return res.status(403).json({ error: 'TOTP enrollment required' });
  (req as any).auth = decoded;
  next();
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const decoded = parseAuthToken(req);
    if (!decoded || !decoded.role) return res.status(401).json({ error: 'Unauthorized' });
    if (decoded.role !== role) return res.status(403).json({ error: 'Forbidden' });
    (req as any).auth = decoded;
    next();
  };
}

export default {
  parseAuthToken,
  requireAuth,
  requireTotpEnrolled,
  requireRole
};
