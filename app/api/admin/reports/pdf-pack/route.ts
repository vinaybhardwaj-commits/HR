import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { renderAppraisalPdf } from '@/lib/appraisal-pdf';
import { buildZip, type ZipEntry } from '@/lib/zip';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // ~74 PDFs per cycle; pinned to sin1 next to Neon

// "Signed-off" = the appraisal is finished from the employee's side. These are the
// records worth archiving. 'discussed' = accepted via the 1:1 (policy 15 Jun 2026).
const SIGNED = ['discussed', 'concurred', 'disagreed', 'hr_review', 'closed'];
const MAX = 300;

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(new URL(req.url).searchParams.get('cycle') ?? 0);
  if (!cycleId) return NextResponse.json({ error: 'cycle required' }, { status: 400 });
  const db = sql();

  const cyc = (await db`SELECT label FROM cycle WHERE id = ${cycleId}`) as { label: string }[];
  if (!cyc[0]) return NextResponse.json({ error: 'cycle not found' }, { status: 404 });

  const ids = (await db`
    SELECT a.id FROM appraisal a JOIN employee e ON e.id = a.employee_id
    WHERE a.cycle_id = ${cycleId} AND a.status = ANY(${SIGNED}::text[])
    ORDER BY e.emp_code LIMIT ${MAX}`) as { id: string }[];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'No accepted appraisals to pack yet. PDFs are included once the 1:1 discussion has been held (status discussed/accepted) or later.' },
      { status: 400 }
    );
  }

  const safeLabel = cyc[0].label.replace(/[^A-Za-z0-9._-]+/g, '-');
  const entries: ZipEntry[] = [];
  for (const { id } of ids) {
    const r = await renderAppraisalPdf(id);
    if (r) entries.push({ name: `${safeLabel}/${r.filename}`, data: new Uint8Array(r.buffer) });
  }

  const zip = buildZip(entries);
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'pdf_pack_generated',
    meta: { cycleId, count: entries.length } });

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="EHRC-appraisals-${safeLabel}-cycle${cycleId}.zip"`,
    },
  });
}
