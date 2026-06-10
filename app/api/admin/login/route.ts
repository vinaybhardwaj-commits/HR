import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { createSession, SESSION_COOKIE } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? '';
  if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });

  const db = sql();
  const rows = (await db`SELECT id, email, name, password_hash, role, failed_attempts, locked_until
                         FROM admin_user WHERE email = ${email}`) as {
    id: number; email: string; name: string; password_hash: string; role: string;
    failed_attempts: number; locked_until: string | null;
  }[];
  // Uniform error for unknown email vs bad password
  const fail = () => NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  if (rows.length === 0) return fail();
  const admin = rows[0];

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    return NextResponse.json({ error: 'account locked — try again later' }, { status: 423 });
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    const fails = admin.failed_attempts + 1;
    if (fails >= MAX_FAILS) {
      await db`UPDATE admin_user SET failed_attempts = 0,
               locked_until = now() + make_interval(mins => ${LOCK_MINUTES}) WHERE id = ${admin.id}`;
      await logAudit({ actorType: 'system', action: 'admin_lockout', meta: { email } });
      return NextResponse.json({ error: 'account locked — try again later' }, { status: 423 });
    }
    await db`UPDATE admin_user SET failed_attempts = ${fails} WHERE id = ${admin.id}`;
    return fail();
  }

  await db`UPDATE admin_user SET failed_attempts = 0, locked_until = NULL WHERE id = ${admin.id}`;
  const jwt = await createSession({ adminId: admin.id, email: admin.email, name: admin.name, role: admin.role });
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'login' });

  const res = NextResponse.json({ ok: true, name: admin.name });
  res.cookies.set(SESSION_COOKIE, jwt, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12
  });
  return res;
}
