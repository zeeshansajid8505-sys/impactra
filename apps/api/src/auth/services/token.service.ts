import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class TokenService {
  /**
   * Generates a cryptographically strong opaque session token.
   * 32 high-entropy random bytes represented as URL-safe base64.
   */
  generateSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Computes the deterministic SHA-256 hash of any token.
   * Used for indexing and database lookup without storing plaintext secrets.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Generates a cryptographically strong hex token for password reset or verification.
   */
  generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
