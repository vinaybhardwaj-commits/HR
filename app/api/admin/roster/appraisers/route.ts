import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Create an appraiser (HOD). They get a queue link once assigned + launch re-run. */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as { full_name?: string; email?: string } | null;
  const name = b?.full_name?.trim();
  if (!name) return NextResponse.json({ error: 'full_name required' }, { status: 400 });
  const db = sql();
  const dup = (await db`SELECT id FROM appraiser WHERE lower(full_name) = ${name.toLowerCase()} AND active`) as { id: number }[];
  if (dup[0]) return NextResponse.json({ error: `an active appraiser named "${name}" already exists` }, { status: 409 });
  const rows = (await db`
    INSERT INTO appraiser (full_name, email) VALUES (${name}, ${b!.email?.trim() || null})
    RETURNING id`) as { id: number }[];
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'appraiser_create',
    meta: { id: rows[0].id, name } });
  return NextResponse.json({ ok: true, id: rows[0].id });
}
