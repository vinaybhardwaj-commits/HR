import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { renderAppraisalPdf } from '@/lib/appraisal-pdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const r = await renderAppraisalPdf(params.id);
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'pdf_generated', appraisalId: params.id });
  return new NextResponse(new Uint8Array(r.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${r.filename}"`,
    },
  });
}
