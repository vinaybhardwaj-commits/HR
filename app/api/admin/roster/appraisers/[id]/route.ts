import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Activate/deactivate an appraiser. Deactivation refused while employees are mapped to them. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = Number(params.id);
  const b = await req.json().catch(() => null) as { active?: boolean; full_name?: string } | null;
  if (!b || (typeof b.active !== 'boolean' && typeof b.full_name !== 'string')) {
    return NextResponse.json({ error: 'active (boolean) or full_name (string) required' }, { status: 400 });
  }
  const db = sql();
  if (typeof b.full_name === 'string') {
    const name = b.full_name.trim();
    if (!name) return NextResponse.json({ error: 'full_name cannot be empty' }, { status: 400 });
    const dup = (await db`SELECT id FROM appraiser WHERE lower(full_name) = ${name.toLowerCase()} AND id <> ${id} AND active`) as { id: number }[];
    if (dup[0]) return NextResponse.json({ error: `an active appraiser named "${name}" already exists` }, { status: 409 });
    const rows = (await db`UPDATE appraiser SET full_name = ${name} WHERE id = ${id} RETURNING id`) as { id: number }[];
    if (!rows[0]) return NextResponse.json({ error: 'appraiser not found' }, { status: 404 });
    await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'appraiser_update',
      meta: { id, rename_to: name } });
    if (typeof b.active !== 'boolean') return NextResponse.json({ ok: true });
  }
  if (!b.active) {
    const mapped = (await db`SELECT count(*)::int AS n FROM employee WHERE default_appraiser_id = ${id} AND active`) as { n: number }[];
    if (mapped[0].n > 0) {
      return NextResponse.json({ error: `cannot deactivate: ${mapped[0].n} active employee(s) still mapped — remap them first` }, { status: 409 });
    }
  }
  const rows = (await db`UPDATE appraiser SET active = ${b.active} WHERE id = ${id} RETURNING id, full_name`) as
    { id: number; full_name: string }[];
  if (!rows[0]) return NextResponse.json({ error: 'appraiser not found' }, { status: 404 });
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'appraiser_update',
    meta: { id, name: rows[0].full_name, active: b.active } });
  return NextResponse.json({ ok: true });
}
