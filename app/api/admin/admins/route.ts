import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Create an additional HR admin. Auth: Bearer MIGRATION_SECRET — owner action,
 * V runs the curl himself (same gate as bootstrap/reset-password). Bootstrap
 * refuses once one admin exists; this is the supported path until /admin/settings
 * ships (B8). Dup-email guarded, bcrypt-12, audited.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const b = await req.json().catch(() => null) as { email?: string; name?: string; password?: string } | null;
  const email = b?.email?.trim().toLowerCase();
  const name = b?.name?.trim();
  const password = b?.password ?? '';
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 10) {
    return NextResponse.json({ error: 'email, name and password (min 10 chars) required' }, { status: 400 });
  }
  const db = sql();
  const dup = (await db`SELECT id FROM admin_user WHERE email = ${email}`) as { id: number }[];
  if (dup[0]) return NextResponse.json({ error: 'an admin with that email already exists' }, { status: 409 });
  const hash = await bcrypt.hash(password, 12);
  const rows = (await db`
    INSERT INTO admin_user (email, name, password_hash, role)
    VALUES (${email}, ${name}, ${hash}, 'super')
    RETURNING id`) as { id: number }[];
  await logAudit({ actorType: 'system', action: 'admin_create', meta: { id: rows[0].id, email, name } });
  return NextResponse.json({ ok: true, id: rows[0].id, email });
}
