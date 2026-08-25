import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
});
import { generate, generateSecret } from 'otplib';
import { disableTotp, generateTotpSecretForEmail, verifyAndEnableTotp } from '../src/api/totp';
import { getUser, setUser } from '../src/api/auth';

describe('TOTP enroll/verify flow', () => {
  it('generates a secret, verifies token, and stores secret and backup codes', async () => {
    const email = 'totp-user@example.com';
    const { secret, otpauth } = await generateTotpSecretForEmail(email);
    expect(secret).toBeTruthy();
    expect(otpauth).toContain(secret);

    // Generate a valid token using the same secret
    const token = await generate({ secret });

    // Create a user first (in-memory) so enable can persist
    await setUser(email, { email, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);

    // Mock request/response objects for verifyAndEnableTotp
    const authToken = jwt.sign({ email, role: 'user' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const req: any = { method: 'POST', body: { email, secret, token }, query: {}, headers: { authorization: `Bearer ${authToken}` } };
    const res: any = {
      status(code: number) {
        this._status = code; return this;
      },
      json(obj: any) { this._json = obj; return this; }
    };

    await verifyAndEnableTotp(req, res);
    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
    expect(res._json.backupCodes).toBeInstanceOf(Array);

    const user = await getUser(email);
    expect(user).toBeTruthy();
    expect((user as any).totp_secret).toBe(secret);
    expect((user as any).backup_codes).toBeTruthy();
  });

  it('rejects TOTP management for a different account', async () => {
    const ownerEmail = 'totp-owner@example.com';
    const otherEmail = 'totp-other@example.com';
    await setUser(ownerEmail, { email: ownerEmail, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const authToken = jwt.sign({ email: ownerEmail, role: 'user' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const req: any = { method: 'POST', body: { email: otherEmail }, query: {}, headers: { authorization: `Bearer ${authToken}` } };
    const res: any = {
      status(code: number) { this._status = code; return this; },
      json(obj: any) { this._json = obj; return this; }
    };

    await disableTotp(req, res);
    expect(res._status).toBe(403);
    expect(res._json.error).toBe('TOTP account mismatch');
  });

  it('requires and accepts the current TOTP token when disabling enrollment', async () => {
    const email = 'totp-disable@example.com';
    const secret = generateSecret();
    await setUser(email, {
      email,
      password: 'x',
      role: 'user',
      totp_secret: secret,
      backup_codes: JSON.stringify(['12345678']),
      createdAt: new Date().toISOString()
    } as any);
    const authToken = jwt.sign({ email, role: 'user' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const token = await generate({ secret });
    const req: any = {
      method: 'POST',
      body: { email, token },
      query: {},
      headers: { authorization: `Bearer ${authToken}` }
    };
    const res: any = {
      status(code: number) { this._status = code; return this; },
      json(obj: any) { this._json = obj; return this; }
    };

    await disableTotp(req, res);
    expect(res._status).toBe(200);
    expect((await getUser(email) as any).totp_secret).toBeNull();
    expect((await getUser(email) as any).backup_codes).toBeNull();
  });
});
