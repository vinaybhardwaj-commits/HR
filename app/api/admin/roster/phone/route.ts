import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { normalizePhone } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/** Set/clear a phone number for an employee or appraiser. Stored E.164 (+91 default). */
export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as
    { role?: string; id?: number; phone?: string } | null;
  if (!b || (b.role !== 'employee' && b.role !== 'appraiser') || !Number.isInteger(b.id)) {
    return NextResponse.json({ error: 'role (employee|appraiser) and id required' }, { status: 400 });
  }
  let phone: string | null = null;
  if ((b.phone ?? '').trim() !== '') {
    phone = normalizePhone(b.phone!);
    if (!phone) return NextResponse.json({ error: 'invalid phone — use a 10-digit Indian mobile or full +country format' }, { status: 400 });
  }
  const db = sql();
  const rows = (b.role === 'employee'
    ? await db`UPDATE employee SET phone = ${phone} WHERE id = ${b.id} RETURNING id`
    : await db`UPDATE appraiser SET phone = ${phone} WHERE id = ${b.id} RETURNING id`) as { id: number }[];
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await logAudit({
    actorType: 'admin', actorLabel: admin.email, action: 'phone_update',
    meta: { role: b.role, id: b.id, phone: phone ? phone.slice(0, 6) + '…' : null }
  });
  return NextResponse.json({ ok: true, phone });
}
