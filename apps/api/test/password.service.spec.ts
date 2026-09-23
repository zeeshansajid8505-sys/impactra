import { PasswordService } from '../src/auth/services/password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('validate', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const result = service.validate('Short1!');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('at least 8 characters');
    });

    it('should reject passwords missing uppercase letters', () => {
      const result = service.validate('lowercase123!');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('uppercase');
    });

    it('should reject passwords missing lowercase letters', () => {
      const result = service.validate('UPPERCASE123!');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('lowercase');
    });

    it('should reject passwords missing numbers or special characters', () => {
      const result = service.validate('NoSpecialOrNumber');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('number or special character');
    });

    it('should accept valid compliant passwords', () => {
      const result = service.validate('SecureP@ssw0rd2026');
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });
  });

  describe('hash and verify', () => {
    it('should securely hash a password with Argon2id and verify matching candidate', async () => {
      const plain = 'StrongP@ssw0rd!';
      const hash = await service.hash(plain);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      // Assert newly generated hash strictly begins with Argon2id format
      expect(hash.startsWith('$argon2id$')).toBe(true);
      // Assert no silent fallback to scrypt for new hashes
      expect(hash.startsWith('$scrypt$')).toBe(false);

      const isValid = await service.verify(hash, plain);
      expect(isValid).toBe(true);
    });

    it('should reject non-matching candidate passwords in constant time', async () => {
      const plain = 'CorrectP@ssw0rd!';
      const hash = await service.hash(plain);

      const isInvalid = await service.verify(hash, 'WrongPassword123!');
      expect(isInvalid).toBe(false);
    });

    it('should safely reject empty, null, or malformed hashes', async () => {
      expect(await service.verify('', 'test')).toBe(false);
      expect(await service.verify('invalid-format', 'test')).toBe(false);
      expect(await service.verify('$argon2id$garbage', 'test')).toBe(false);
      expect(await service.verify('$scrypt$garbage', 'test')).toBe(false);
    });

    it('should verify existing legacy scrypt hashes for backward compatibility', async () => {
      // Legacy scrypt hash format: $scrypt$N=16384,r=8,p=1$<saltHex>$<hashHex>
      const legacySalt = 'a1b2c3d4e5f60718';
      const crypto = await import('crypto');
      const key = crypto.scryptSync('LegacyPassword1!', legacySalt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      });
      const legacyHash = `$scrypt$N=16384,r=8,p=1$${legacySalt}$${key.toString('hex')}`;

      expect(await service.verify(legacyHash, 'LegacyPassword1!')).toBe(true);
      expect(await service.verify(legacyHash, 'WrongLegacyPassword!')).toBe(false);
    });
  });
});
