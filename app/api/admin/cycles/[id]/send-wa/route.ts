import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';
import { appBaseUrl } from '@/lib/portal';
import { logAudit } from '@/lib/audit';
import { sendWhatsApp, twilioConfigured } from '@/lib/twilio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // up to ~94 sends per run

type Target = {
  role: 'employee' | 'hod'; holderId: number; name: string;
  phone: string | null; pending: boolean; url: string;
};

function message(kind: 'invite' | 'reminder', role: 'employee' | 'hod', name: string, url: string): string {
  const first = name.split(' ')[0];
  if (role === 'employee') {
    return kind === 'invite'
      ? `Dear ${first},\n\nAs part of the Even performance appraisal, please complete your self-appraisal using your personal link below. It takes about 10 minutes and works on your phone.\n\n${url}\n\nPlease do not forward this link — it is personal to you.\n\n— HR, Even Healthcare`
      : `Dear ${first},\n\nA gentle reminder from Even HR — your appraisal has a step waiting for you. Please open your personal link below to continue.\n\n${url}\n\nPlease do not forward this link — it is personal to you.\n\n— HR, Even Healthcare`;
  }
  return kind === 'invite'
    ? `Dear ${first},\n\nYour appraisal queue for your team is ready. Use your personal link below to review each self-appraisal and score your team members.\n\n${url}\n\nPlease do not forward this link — it is personal to you.\n\n— HR, Even Healthcare`
    : `Dear ${first},\n\nA gentle reminder from Even HR — some of your team appraisals are still pending your scoring or discussion. Please continue via your personal link below.\n\n${url}\n\nPlease do not forward this link — it is personal to you.\n\n— HR, Even Healthcare`;
}

/**
 * HR-triggered bulk WhatsApp send via Twilio.
 * Body: { kind: 'invite' | 'reminder' }
 *  - invite: everyone not already successfully sent an invite this cycle (dedup).
 *  - reminder: only people with a pending step (employee: invited/discussed; HOD: unscored remaining).
 * People without a phone are skipped and reported; every attempt is logged to wa_send_log.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!twilioConfigured()) {
    return NextResponse.json({ error: 'Twilio is not configured (TWILIO_* env vars missing)' }, { status: 503 });
  }
  const cycleId = Number(params.id);
  const b = await req.json().catch(() => null) as { kind?: string } | null;
  const kind = b?.kind;
  if (kind !== 'invite' && kind !== 'reminder') {
    return NextResponse.json({ error: "kind must be 'invite' or 'reminder'" }, { status: 400 });
  }
  const db = sql();
  const cycles = (await db`SELECT id, label, status FROM cycle WHERE id = ${cycleId}`) as
    { id: number; label: string; status: string }[];
  if (!cycles[0]) return NextResponse.json({ error: 'cycle not found' }, { status: 404 });
  if (cycles[0].status !== 'live') return NextResponse.json({ error: 'cycle is not live' }, { status: 400 });

  const base = appBaseUrl();

  const empRows = (await db`
    SELECT t.secret_enc, e.id AS holder_id, e.full_name, e.phone, a.status
    FROM token t
    JOIN employee e ON e.id = t.holder_id
    LEFT JOIN appraisal a ON a.cycle_id = t.cycle_id AND a.employee_id = e.id
    WHERE t.cycle_id = ${cycleId} AND t.role = 'employee' AND NOT t.revoked AND t.secret_enc IS NOT NULL
    ORDER BY e.full_name`) as
    { secret_enc: string; holder_id: number; full_name: string; phone: string | null; status: string | null }[];

  const hodRows = (await db`
    SELECT t.secret_enc, ap.id AS holder_id, ap.full_name, ap.phone,
      (SELECT count(*)::int FROM appraisal a WHERE a.cycle_id = t.cycle_id AND a.appraiser_id = ap.id AND a.status <> 'cancelled') AS total,
      (SELECT count(*)::int FROM appraisal a WHERE a.cycle_id = t.cycle_id AND a.appraiser_id = ap.id
        AND a.status NOT IN ('invited','self_submitted','cancelled')) AS scored
    FROM token t JOIN appraiser ap ON ap.id = t.holder_id
    WHERE t.cycle_id = ${cycleId} AND t.role = 'hod' AND NOT t.revoked AND t.secret_enc IS NOT NULL
    ORDER BY ap.full_name`) as
    { secret_enc: string; holder_id: number; full_name: string; phone: string | null; total: number; scored: number }[];

  const targets: Target[] = [
    ...hodRows.map(r => ({
      role: 'hod' as const, holderId: r.holder_id, name: r.full_name, phone: r.phone,
      pending: r.scored < r.total, url: `${base}/hod/${decryptSecret(r.secret_enc)}`
    })),
    ...empRows.map(r => ({
      role: 'employee' as const, holderId: r.holder_id, name: r.full_name, phone: r.phone,
      pending: r.status === 'invited' || r.status === 'discussed',
      url: `${base}/me/${decryptSecret(r.secret_enc)}`
    }))
  ];

  // Dedup invites: skip anyone with a non-failed invite already logged for this cycle.
  const already = new Set<string>();
  if (kind === 'invite') {
    const sent = (await db`
      SELECT DISTINCT recipient_role, holder_id FROM wa_send_log
      WHERE cycle_id = ${cycleId} AND kind = 'invite' AND status NOT IN ('failed','undelivered')`) as
      { recipient_role: string; holder_id: number }[];
    for (const s of sent) already.add(`${s.recipient_role}:${s.holder_id}`);
  }

  const list = targets.filter(t =>
    (kind === 'reminder' ? t.pending : !already.has(`${t.role}:${t.holderId}`)));

  const skippedNoPhone: string[] = [];
  const failed: { name: string; error: string }[] = [];
  let sentCount = 0;

  const queue = list.slice();
  const worker = async () => {
    for (;;) {
      const t = queue.shift();
      if (!t) return;
      if (!t.phone) { skippedNoPhone.push(t.name); continue; }
      const r = await sendWhatsApp({
        toE164: t.phone, kind,
        body: message(kind, t.role, t.name, t.url),
        variables: { '1': t.name.split(' ')[0], '2': t.url }
      });
      await db`
        INSERT INTO wa_send_log (cycle_id, recipient_role, holder_id, recipient_name, phone, kind, message_sid, status, error)
        VALUES (${cycleId}, ${t.role}, ${t.holderId}, ${t.name}, ${t.phone}, ${kind},
                ${r.ok ? r.sid : null}, ${r.ok ? r.status : 'failed'}, ${r.ok ? null : r.error})`;
      if (r.ok) sentCount++;
      else failed.push({ name: t.name, error: r.error });
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  await logAudit({
    actorType: 'admin', actorLabel: admin.email, action: 'wa_bulk_send',
    meta: { cycleId, kind, sent: sentCount, skippedNoPhone: skippedNoPhone.length, deduped: targets.length - list.length, failed: failed.length }
  });
  return NextResponse.json({
    ok: true, kind, sent: sentCount, deduped: targets.length - list.length,
    skipped_no_phone: skippedNoPhone, failed
  });
}
