import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Read-only cycle progress stats. Auth: admin session OR Bearer MIGRATION_SECRET
 * (lets the owner/assistant check progress via curl without a browser session).
 * Returns per-live-cycle status counts, link-usage counts and recent activity.
 */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  const bearerOk = !!process.env.MIGRATION_SECRET &&
    (req.headers.get('authorization') ?? '') === `Bearer ${process.env.MIGRATION_SECRET}`;
  if (!admin && !bearerOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = sql();

  const cycles = (await db`
    SELECT id, label, is_test, status, launched_at::text FROM cycle
    WHERE status = 'live' ORDER BY id DESC`) as
    { id: number; label: string; is_test: boolean; status: string; launched_at: string }[];

  const out = [];
  for (const c of cycles) {
    const counts = (await db`
      SELECT status, count(*)::int AS n FROM appraisal WHERE cycle_id = ${c.id} GROUP BY status`) as
      { status: string; n: number }[];
    const links = (await db`
      SELECT role, count(*)::int AS total,
             count(*) FILTER (WHERE last_used_at IS NOT NULL)::int AS used
      FROM token WHERE cycle_id = ${c.id} AND NOT revoked GROUP BY role`) as
      { role: string; total: number; used: number }[];
    out.push({ ...c, counts, links });
  }

  const activity = (await db`
    SELECT al.at::text, al.action, al.actor_type, e.full_name
    FROM audit_log al
    LEFT JOIN appraisal a ON a.id = al.appraisal_id
    LEFT JOIN employee e ON e.id = a.employee_id
    ORDER BY al.at DESC LIMIT 25`) as
    { at: string; action: string; actor_type: string; full_name: string | null }[];

  return NextResponse.json({ cycles: out, recent_activity: activity });
}
