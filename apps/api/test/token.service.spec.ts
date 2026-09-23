import { TokenService } from '../src/auth/services/token.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService();
  });

  it('should generate high-entropy URL-safe session tokens', () => {
    const token1 = service.generateSessionToken();
    const token2 = service.generateSessionToken();

    expect(token1).toBeDefined();
    expect(token2).toBeDefined();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThanOrEqual(40);
    // Base64url should only contain valid characters
    expect(/^[A-Za-z0-9_-]+$/.test(token1)).toBe(true);
  });

  it('should compute deterministic SHA-256 token hashes', () => {
    const token = 'sample-opaque-token-12345';
    const hash1 = service.hashToken(token);
    const hash2 = service.hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex digest is 64 characters
    expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
  });

  it('should produce different hashes for different tokens', () => {
    const hashA = service.hashToken('token-A');
    const hashB = service.hashToken('token-B');

    expect(hashA).not.toBe(hashB);
  });

  it('should generate opaque hex tokens for password resets', () => {
    const token = service.generateOpaqueToken();

    expect(token.length).toBe(64); // 32 bytes in hex = 64 characters
    expect(/^[a-f0-9]{64}$/.test(token)).toBe(true);
  });
});
