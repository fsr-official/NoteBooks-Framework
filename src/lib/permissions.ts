import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getUser } from '../api/auth.js';
import type { RoleKey } from './roles.js';

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

export function hasRole(decoded: any, role: RoleKey | string): boolean {
  if (!decoded) return false;
  if (decoded.role === 'admin' && role === 'super_admin') return true;
  if (decoded.role === role) return true;
  const roles = Array.isArray(decoded.roles) ? decoded.roles : Array.isArray(decoded.role_keys) ? decoded.role_keys : [];
  return roles.includes(role);
}

export function requireAnyRole(...roles: Array<RoleKey | string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const decoded = parseAuthToken(req);
    if (!decoded || !decoded.email) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.some((role) => hasRole(decoded, role))) return res.status(403).json({ error: 'Forbidden' });
    (req as any).auth = decoded;
    next();
  };
}

export async function getAdminSecurityContext(req: Request): Promise<
  | { ok: true; auth: any }
  | { ok: false; status: 401 | 403; error: string }
> {
  const decoded = parseAuthToken(req);
  if (!decoded || !decoded.email) {
    return { ok: false, status: 401, error: 'Administrator authentication required' };
  }
  if (!hasRole(decoded, 'super_admin') && decoded.role !== 'admin') {
    return { ok: false, status: 403, error: 'Administrator role required' };
  }

  try {
    const user = await getUser(String(decoded.email));
    if (!user) {
      return { ok: false, status: 403, error: 'Administrator account not found' };
    }
    if (!(user as any).github_id) {
      return { ok: false, status: 403, error: 'GitHub account linking required for administrators' };
    }
    if (!(user as any).totp_secret) {
      return { ok: false, status: 403, error: 'TOTP enrollment required for administrators' };
    }
    return {
      ok: true,
      auth: { ...decoded, githubLinked: true, totpEnrolled: true }
    };
  } catch {
    return { ok: false, status: 403, error: 'Administrator security verification failed' };
  }
}

export async function requireAdminSecurity(req: Request, res: Response, next: NextFunction) {
  const result = await getAdminSecurityContext(req);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  (req as any).auth = result.auth;
  return next();
}

export default {
  parseAuthToken,
  requireAuth,
  requireTotpEnrolled,
  requireRole,
  hasRole,
  requireAnyRole,
  getAdminSecurityContext,
  requireAdminSecurity
};
