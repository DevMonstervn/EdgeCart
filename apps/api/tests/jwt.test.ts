import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../src/utils/jwt.js';

describe('WebCrypto HMAC-SHA256 JWT Utility', () => {
  const secret = 'test-jwt-secret-key-32-chars-long!';

  it('should sign and verify valid JWT token', async () => {
    const payload = {
      sub: 'usr_123',
      email: 'user@example.com',
      role: 'CUSTOMER',
    };

    const token = await signJwt(payload, secret, 3600);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const verified = await verifyJwt(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe(payload.sub);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.role).toBe(payload.role);
  });

  it('should return null if secret does not match', async () => {
    const token = await signJwt({ sub: '1', email: 'a@b.c', role: 'ADMIN' }, secret, 3600);
    const verified = await verifyJwt(token, 'different-secret');
    expect(verified).toBeNull();
  });

  it('should return null for expired token', async () => {
    const token = await signJwt({ sub: '1', email: 'a@b.c', role: 'ADMIN' }, secret, -10);
    const verified = await verifyJwt(token, secret);
    expect(verified).toBeNull();
  });
});
