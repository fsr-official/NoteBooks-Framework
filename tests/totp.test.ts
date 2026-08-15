import { describe, it, expect } from 'vitest';
import { generateTotpSecretForEmail, verifyAndEnableTotp } from '../src/api/totp';
import { getUser, setUser } from '../src/api/auth';

describe('TOTP enroll/verify flow', () => {
  it('generates a secret, verifies token, and stores secret and backup codes', async () => {
    const email = 'totp-user@example.com';
    const { secret, otpauth } = await generateTotpSecretForEmail(email);
    expect(secret).toBeTruthy();
    expect(otpauth).toContain(secret);

    // Generate a valid token using the same secret
    const { authenticator } = await import('otplib');
    const token = authenticator.generate(secret);

    // Create a user first (in-memory) so enable can persist
    await setUser(email, { email, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);

    // Mock request/response objects for verifyAndEnableTotp
    const req: any = { method: 'POST', body: { email, secret, token }, query: {} };
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
});
