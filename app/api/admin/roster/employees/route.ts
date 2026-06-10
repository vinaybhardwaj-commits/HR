import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Create an employee. New joiners enter a live cycle via "Re-run launch (fill missing)". */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as {
    emp_code?: string; full_name?: string; department?: string; sub_department?: string;
    designation?: string; track?: string; default_appraiser_id?: number; email?: string;
  } | null;
  const code = b?.emp_code?.trim();
  const name = b?.full_name?.trim();
  const dept = b?.department?.trim();
  if (!code || !name || !dept || (b?.track !== 'C' && b?.track !== 'N') || !Number.isInteger(b?.default_appraiser_id)) {
    return NextResponse.json({ error: 'emp_code, full_name, department, track (C/N) and HOD are required' }, { status: 400 });
  }
  const db = sql();
  const hod = (await db`SELECT id FROM appraiser WHERE id = ${b!.default_appraiser_id} AND active`) as { id: number }[];
  if (!hod[0]) return NextResponse.json({ error: 'HOD not found or inactive' }, { status: 400 });
  const dup = (await db`
    SELECT id FROM employee WHERE emp_code = ${code}
      AND hospital_id = (SELECT id FROM hospital WHERE code = 'EHRC')`) as { id: number }[];
  if (dup[0]) return NextResponse.json({ error: `employee code ${code} already exists` }, { status: 409 });

  const rows = (await db`
    INSERT INTO employee (hospital_id, emp_code, full_name, department, sub_department, designation, track, email, default_appraiser_id)
    VALUES ((SELECT id FROM hospital WHERE code = 'EHRC'), ${code}, ${name}, ${dept},
            ${b!.sub_department?.trim() || null}, ${b!.designation?.trim() || null}, ${b!.track},
            ${b!.email?.trim() || null}, ${b!.default_appraiser_id})
    RETURNING id`) as { id: number }[];

  const liveCycles = (await db`SELECT id, label FROM cycle WHERE status = 'live' AND NOT is_test`) as
    { id: number; label: string }[];
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'employee_create',
    meta: { id: rows[0].id, emp_code: code, name, hod: b!.default_appraiser_id } });
  return NextResponse.json({ ok: true, id: rows[0].id, live_cycles: liveCycles });
}
