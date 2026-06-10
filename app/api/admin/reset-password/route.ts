import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Owner password reset (forgotten password / B4 rotation). Auth: Bearer
 * MIGRATION_SECRET — same owner-level gate as /api/admin/migrate and bootstrap.
 * V runs this himself via curl; the password never transits chat or the repo.
 * Also clears the login lockout (failed_attempts / locked_until). Audited.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? '';
  if (!email || password.length < 10) {
    return NextResponse.json({ error: 'email and password (min 10 chars) required' }, { status: 400 });
  }
  const hash = await bcrypt.hash(password, 12);
  const rows = (await sql()`
    UPDATE admin_user SET password_hash = ${hash}, failed_attempts = 0, locked_until = NULL
    WHERE email = ${email} RETURNING id, email`) as { id: number; email: string }[];
  if (!rows[0]) return NextResponse.json({ error: 'no admin with that email' }, { status: 404 });
  await logAudit({ actorType: 'system', action: 'admin_password_reset', meta: { email } });
  return NextResponse.json({ ok: true, email: rows[0].email });
}
