import { sql } from '@/lib/db';
import { hashToken } from '@/lib/tokens';

export type TokenRow = {
  id: number; role: 'employee' | 'hod'; holder_type: string; holder_id: number;
  cycle_id: number; label: string | null; expires_at: string; revoked: boolean;
};

/** Resolve a portal token secret. Returns null for unknown/revoked/expired. */
export async function resolvePortalToken(secret: string): Promise<TokenRow | null> {
  if (!secret || secret.length < 20 || secret.length > 100) return null;
  const rows = (await sql()`
    SELECT id, role, holder_type, holder_id, cycle_id, label, expires_at, revoked
    FROM token WHERE token_hash = ${hashToken(secret)}`) as TokenRow[];
  const t = rows[0];
  if (!t || t.revoked || new Date(t.expires_at) < new Date()) return null;
  sql()`UPDATE token SET last_used_at = now() WHERE id = ${t.id}`.catch(() => { /* intentional: best-effort */ });
  return t;
}

export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'https://appraise.evenos.app';
}
