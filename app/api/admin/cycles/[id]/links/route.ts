import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';
import { appBaseUrl } from '@/lib/portal';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Portal links + live status for HR distribution (WhatsApp / print). Access audited. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(params.id);
  const db = sql();

  const empTokens = (await db`
    SELECT t.secret_enc, e.full_name, e.emp_code, a.status
    FROM token t
    JOIN employee e ON e.id = t.holder_id
    LEFT JOIN appraisal a ON a.cycle_id = t.cycle_id AND a.employee_id = e.id
    WHERE t.cycle_id = ${cycleId} AND t.role = 'employee' AND NOT t.revoked AND t.secret_enc IS NOT NULL
    ORDER BY e.full_name`) as
    { secret_enc: string; full_name: string; emp_code: string; status: string | null }[];

  const hodTokens = (await db`
    SELECT t.secret_enc, ap.full_name,
      (SELECT count(*)::int FROM appraisal a WHERE a.cycle_id = t.cycle_id AND a.appraiser_id = ap.id AND a.status <> 'cancelled') AS total,
      (SELECT count(*)::int FROM appraisal a WHERE a.cycle_id = t.cycle_id AND a.appraiser_id = ap.id
        AND a.status NOT IN ('invited','self_submitted','cancelled')) AS scored
    FROM token t JOIN appraiser ap ON ap.id = t.holder_id
    WHERE t.cycle_id = ${cycleId} AND t.role = 'hod' AND NOT t.revoked AND t.secret_enc IS NOT NULL
    ORDER BY ap.full_name`) as
    { secret_enc: string; full_name: string; total: number; scored: number }[];

  const base = appBaseUrl();
  const links = [
    ...hodTokens.map(t => ({
      role: 'hod' as const,
      name: t.full_name,
      status: `${t.scored}/${t.total} scored`,
      pending: t.scored < t.total,
      url: `${base}/hod/${decryptSecret(t.secret_enc)}`
    })),
    ...empTokens.map(t => ({
      role: 'employee' as const,
      name: t.full_name,
      code: t.emp_code,
      status: t.status ?? 'no appraisal',
      pending: t.status === 'invited' || t.status === 'discussed',
      url: `${base}/me/${decryptSecret(t.secret_enc)}`
    }))
  ];
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'links_viewed', meta: { cycleId, n: links.length } });
  return NextResponse.json({ links });
}
