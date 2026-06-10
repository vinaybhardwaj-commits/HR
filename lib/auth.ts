import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = 'appraise_session';
const alg = 'HS256';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

export type AdminSession = { adminId: number; email: string; name: string; role: string };

export async function createSession(payload: AdminSession): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret());
}

export async function getCurrentAdmin(): Promise<AdminSession | null> {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE;
