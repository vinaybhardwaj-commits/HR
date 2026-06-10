import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * One-time first-admin creation. Auth: Bearer MIGRATION_SECRET (owner action — V runs this).
 * Refuses if any admin already exists; later admins are added from /admin/settings.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null) as { email?: string; name?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const name = body?.name?.trim();
  const password = body?.password ?? '';
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 10) {
    return NextResponse.json({ error: 'email, name and password (min 10 chars) required' }, { status: 400 });
  }
  const db = sql();
  const existing = (await db`SELECT count(*)::int AS n FROM admin_user`) as { n: number }[];
  if (existing[0].n > 0) {
    return NextResponse.json({ error: 'an admin already exists; use /admin/settings' }, { status: 409 });
  }
  const hash = await bcrypt.hash(password, 12);
  await db`INSERT INTO admin_user (email, name, password_hash, role)
           VALUES (${email}, ${name}, ${hash}, 'super')`;
  await logAudit({ actorType: 'system', action: 'bootstrap_admin', meta: { email } });
  return NextResponse.json({ ok: true, email });
}
