import { describe, it, expect, beforeAll } from 'vitest';
import permissions from '../src/lib/permissions';
import jwt from 'jsonwebtoken';
import { setUser } from '../src/api/auth';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
});

describe('Permissions middleware', () => {
  it('rejects requests when TOTP not enrolled', async () => {
    const email = 'perm-no-totp@example.com';
    await setUser(email, { email, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = {
      _status: 0,
      _json: null,
      status(code: number) { this._status = code; return this; },
      json(obj: any) { this._json = obj; return this; }
    };
    let called = false;
    await permissions.requireTotpEnrolled(req, res, () => { called = true; });
    expect(called).toBe(false);
    expect(res._status).toBe(403);
    expect(res._json.error).toBe('TOTP enrollment required');
  });

  it('allows requests when TOTP enrolled', async () => {
    const email = 'perm-totp@example.com';
    const secret = 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD';
    await setUser(email, { email, password: 'x', role: 'user', createdAt: new Date().toISOString(), totp_secret: secret } as any);
    const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = {
      _status: 0,
      _json: null,
      status(code: number) { this._status = code; return this; },
      json(obj: any) { this._json = obj; return this; }
    };
    let called = false;
    await permissions.requireTotpEnrolled(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(res._status).toBe(0);
  });
});
