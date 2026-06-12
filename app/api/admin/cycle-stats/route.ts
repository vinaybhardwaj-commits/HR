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
    const pending_self = (await db`
      SELECT e.emp_code, e.full_name, ap.full_name AS hod,
             GREATEST(0, floor(extract(epoch FROM now() - a.created_at) / 86400))::int AS days,
             (t.last_used_at IS NOT NULL) AS opened_link
      FROM appraisal a
      JOIN employee e ON e.id = a.employee_id
      JOIN appraiser ap ON ap.id = a.appraiser_id
      LEFT JOIN token t ON t.cycle_id = a.cycle_id AND t.role = 'employee'
        AND t.holder_type = 'employee' AND t.holder_id = e.id AND NOT t.revoked
      WHERE a.cycle_id = ${c.id} AND a.status = 'invited'
      ORDER BY ap.full_name, e.full_name`) as
      { emp_code: string; full_name: string; hod: string; days: number; opened_link: boolean }[];
    out.push({ ...c, counts, links, pending_self });
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
