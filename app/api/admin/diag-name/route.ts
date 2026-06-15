import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** TEMP read-only roster lookup (Bearer MIGRATION_SECRET). ?q= filters by name
 *  ILIKE; omit q to list all. Returns employees + appraisers. Remove after use. */
export async function GET(req: NextRequest) {
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || (req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get('q');
  const pat = q ? `%${q}%` : '%';
  const db = sql();
  const employees = await db`
    SELECT id, emp_code, full_name, active, default_appraiser_id
    FROM employee WHERE full_name ILIKE ${pat} ORDER BY full_name`;
  const appraisers = await db`
    SELECT id, full_name, active FROM appraiser WHERE full_name ILIKE ${pat} ORDER BY full_name`;
  return NextResponse.json({ employees, appraisers });
}
