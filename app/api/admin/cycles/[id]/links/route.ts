import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';
import { appBaseUrl } from '@/lib/portal';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Portal links for HR distribution (WhatsApp / print). Access audited. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(params.id);
  const tokens = (await sql()`
    SELECT t.role, t.holder_type, t.holder_id, t.label, t.secret_enc,
           e.full_name AS emp_name, e.emp_code, ap.full_name AS appraiser_name
    FROM token t
    LEFT JOIN employee e ON t.holder_type = 'employee' AND e.id = t.holder_id
    LEFT JOIN appraiser ap ON t.holder_type = 'appraiser' AND ap.id = t.holder_id
    WHERE t.cycle_id = ${cycleId} AND NOT t.revoked AND t.secret_enc IS NOT NULL`) as {
    role: string; holder_type: string; holder_id: number; label: string | null; secret_enc: string;
    emp_name: string | null; emp_code: string | null; appraiser_name: string | null;
  }[];
  const base = appBaseUrl();
  const links = tokens.map(t => ({
    role: t.role,
    name: t.role === 'employee' ? `${t.emp_name} (${t.emp_code})` : (t.appraiser_name ?? t.label),
    url: t.role === 'employee'
      ? `${base}/me/${decryptSecret(t.secret_enc)}`
      : `${base}/hod/${decryptSecret(t.secret_enc)}`
  }));
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'links_viewed', meta: { cycleId, n: links.length } });
  return NextResponse.json({ links });
}
