import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function key(): Buffer {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return createHash('sha256').update(`${s}::token-enc`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptSecret(blob: string): string {
  const [iv, enc, tag] = blob.split('.').map(p => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
