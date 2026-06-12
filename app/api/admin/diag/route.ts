import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** TEMPORARY diagnostic (Bearer MIGRATION_SECRET): raw rows for the Ajith mystery. */
export async function GET(req: NextRequest) {
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || (req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = sql();
  const employees = await db`
    SELECT id, emp_code, full_name, active, default_appraiser_id FROM employee
    WHERE full_name ILIKE '%ajith%'`;
  const appraisals = await db`
    SELECT a.id, a.cycle_id, a.employee_id, a.appraiser_id, a.status, a.total_score,
           a.scores_submitted_at::text, ap.full_name AS appraiser_name
    FROM appraisal a JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE a.employee_id IN (SELECT id FROM employee WHERE full_name ILIKE '%ajith%')`;
  const appraisers = await db`
    SELECT id, full_name, active FROM appraiser
    WHERE full_name ILIKE '%vinay%' OR full_name ILIKE '%yash%'`;
  const tokens = await db`
    SELECT id, role, holder_type, holder_id, cycle_id, label, revoked, last_used_at::text
    FROM token WHERE role = 'hod' AND holder_id IN (
      SELECT id FROM appraiser WHERE full_name ILIKE '%vinay%' OR full_name ILIKE '%yash%')`;
  return NextResponse.json({ employees, appraisals, appraisers, tokens });
}
