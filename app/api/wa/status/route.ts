import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { appBaseUrl } from '@/lib/portal';
import { validateTwilioSignature } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/**
 * Twilio status callback (form-encoded POST). Signature-validated against
 * TWILIO_AUTH_TOKEN. Updates wa_send_log.status by MessageSid. Negative terminal
 * statuses (failed/undelivered) are sticky vs late 'delivered' races.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const signature = req.headers.get('x-twilio-signature') ?? '';
  const url = `${appBaseUrl()}/api/wa/status`;
  if (!validateTwilioSignature(url, params, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  const sid = params.MessageSid;
  const status = params.MessageStatus;
  if (!sid || !status) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  const error = params.ErrorCode ? `twilio_${params.ErrorCode}` : null;

  await sql()`
    UPDATE wa_send_log
    SET status = ${status}, error = COALESCE(${error}, error)
    WHERE message_sid = ${sid}
      AND status NOT IN ('failed','undelivered')`;
  return new NextResponse(null, { status: 204 });
}
