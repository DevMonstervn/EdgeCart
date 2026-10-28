import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/utils/crypto.js';

describe('WebCrypto PBKDF2 Password Hashing', () => {
  it('should hash a password and verify correctly', async () => {
    const rawPassword = 'SuperSecretPassword123!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toContain(':');
    const [salt, derived] = hash.split(':');
    expect(salt.length).toBe(32); // 16 bytes hex
    expect(derived.length).toBe(64); // 32 bytes hex

    const isValid = await verifyPassword(rawPassword, hash);
    expect(isValid).toBe(true);
  });

  it('should fail verification with wrong password', async () => {
    const rawPassword = 'CorrectPassword';
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword('WrongPassword', hash);
    expect(isValid).toBe(false);
  });
});
