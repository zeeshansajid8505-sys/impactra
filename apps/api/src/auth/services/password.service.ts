import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

export interface PasswordValidationResult {
  isValid: boolean;
  message?: string;
}

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  /**
   * Hashes a plaintext password using Argon2id with explicit security parameters.
   * Fails securely if Argon2id hashing fails; does NOT silently fall back to scrypt.
   */
  async hash(password: string): Promise<string> {
    try {
      return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64 MB (OWASP / NIST recommendation)
        timeCost: 3,       // 3 iterations
        parallelism: 4,    // 4 threads/lanes
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Argon2id hashing failed securely: ${msg}`);
      throw new InternalServerErrorException(
        'Failed to securely compute password hash with Argon2id.',
      );
    }
  }

  /**
   * Verifies a candidate password against a stored password hash in constant time.
   * Supports Argon2id (standard) and legacy scrypt hashes for backward compatibility.
   */
  async verify(hash: string, candidate: string): Promise<boolean> {
    if (!hash || !candidate) {
      return false;
    }

    // 1. Argon2id verification (Primary / Standard)
    if (hash.startsWith('$argon2')) {
      try {
        return await argon2.verify(hash, candidate);
      } catch {
        return false;
      }
    }

    // 2. Legacy scrypt verification (Read-only backward compatibility; never used for new hashes)
    if (hash.startsWith('$scrypt$')) {
      try {
        const parts = hash.split('$');
        // Format: ["", "scrypt", "N=16384,r=8,p=1", salt, hashHex]
        const salt = parts[3];
        const originalHashHex = parts[4];
        if (!salt || !originalHashHex) return false;

        const originalKey = Buffer.from(originalHashHex, 'hex');
        const candidateKey = crypto.scryptSync(candidate, salt, originalKey.length, {
          N: 16384,
          r: 8,
          p: 1,
          maxmem: 64 * 1024 * 1024,
        });

        return crypto.timingSafeEqual(originalKey, candidateKey);
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Validates password strength according to Impactra security policy.
   * Minimum 8 characters, maximum 128 characters, with lowercase, uppercase, and digit/special character.
   */
  validate(password: string): PasswordValidationResult {
    if (!password || typeof password !== 'string') {
      return { isValid: false, message: 'Password is required' };
    }

    if (password.length < 8) {
      return {
        isValid: false,
        message: 'Password must be at least 8 characters in length',
      };
    }

    if (password.length > 128) {
      return {
        isValid: false,
        message: 'Password must not exceed 128 characters',
      };
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigitOrSpecial = /[\d\W_]/.test(password);

    if (!hasUpper || !hasLower || !hasDigitOrSpecial) {
      return {
        isValid: false,
        message:
          'Password must contain at least one uppercase letter, one lowercase letter, and one number or special character',
      };
    }

    return { isValid: true };
  }
}
