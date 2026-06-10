import { createHash, randomBytes } from 'crypto';

export function mintToken(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString('base64url');
  return { secret, hash: hashToken(secret) };
}

export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** For logs only — never log a full token. */
export function tokenTail(secret: string): string {
  return `…${secret.slice(-4)}`;
}
