import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** TEMP read-only diagnostic (Bearer MIGRATION_SECRET). Inspect an HOD's queue:
 *  matching appraiser records, their live-cycle appraisals (status + draft vs
 *  submitted score counts), and recent audit touching them. Remove after use. */
export async function GET(req: NextRequest) {
  const secret = process.env.MIGRATION_SECRET;
  if (!secret || (req.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get('q') ?? 'chandrika';
  const pat = `%${q}%`;
  const db = sql();

  const appraisers = await db`
    SELECT id, full_name, active FROM appraiser WHERE full_name ILIKE ${pat} ORDER BY full_name`;

  const appraisals = await db`
    SELECT ap.full_name AS hod, ap.id AS hod_id, a.id AS appraisal_id, a.status,
           a.scores_submitted_at::text AS submitted_at, a.discussion_date::text AS disc_date,
           a.reopened_count, e.emp_code, e.full_name AS employee,
           (SELECT count(*)::int FROM score s WHERE s.appraisal_id = a.id AND s.is_draft) AS draft_scores,
           (SELECT count(*)::int FROM score s WHERE s.appraisal_id = a.id AND NOT s.is_draft) AS final_scores
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    JOIN cycle c ON c.id = a.cycle_id
    WHERE c.status = 'live' AND ap.full_name ILIKE ${pat}
    ORDER BY ap.full_name, a.status, e.full_name`;

  const apprAudit = await db`
    SELECT al.at::text AS at, al.action, al.actor_type, e.full_name AS employee
    FROM audit_log al
    JOIN appraisal a ON a.id = al.appraisal_id
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE ap.full_name ILIKE ${pat}
    ORDER BY al.at DESC LIMIT 80`;

  const remaps = await db`
    SELECT al.at::text AS at, al.action, al.actor_label, al.meta
    FROM audit_log al
    WHERE al.action IN ('employee_update','appraiser_update') AND al.meta::text ILIKE ${pat}
    ORDER BY al.at DESC LIMIT 40`;

  const tokens = await db`
    SELECT ap.full_name AS hod, t.last_used_at::text AS last_used, t.revoked
    FROM token t JOIN appraiser ap ON ap.id = t.holder_id
    WHERE t.role = 'hod' AND t.holder_type = 'appraiser' AND ap.full_name ILIKE ${pat}
    ORDER BY ap.full_name`;

  return NextResponse.json({ appraisers, tokens, appraisals, apprAudit, remaps });
}
