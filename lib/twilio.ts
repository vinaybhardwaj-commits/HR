/**
 * Twilio WhatsApp sender — zero-dependency (plain fetch against the Twilio REST API).
 * Works against the Twilio Sandbox (free-form Body) or a production WhatsApp sender
 * (pre-approved Content templates via TWILIO_CONTENT_SID_*). Switching from sandbox
 * to production = env vars only, no code change.
 *
 * Env:
 *  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN  — account credentials
 *  TWILIO_WHATSAPP_FROM                   — e.g. whatsapp:+14155238886 (sandbox)
 *  TWILIO_CONTENT_SID_INVITE (optional)   — approved template SID for invites
 *  TWILIO_CONTENT_SID_REMINDER (optional) — approved template SID for reminders
 *  Template variables when ContentSid is used: {{1}} = first name, {{2}} = portal URL.
 */
import crypto from 'crypto';
import { appBaseUrl } from '@/lib/portal';

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

/** Normalise an Indian (default) phone number to E.164. Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s\-().]/g, '');
  if (!raw) return null;
  let p = raw;
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+')) {
    if (/^91\d{10}$/.test(p)) p = '+' + p;
    else if (/^0\d{10}$/.test(p)) p = '+91' + p.slice(1);
    else if (/^\d{10}$/.test(p)) p = '+91' + p;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

export type WaSendResult = { ok: true; sid: string; status: string } | { ok: false; error: string };

export async function sendWhatsApp(args: {
  toE164: string;
  kind: 'invite' | 'reminder';
  body: string;                       // used when no ContentSid configured (sandbox)
  variables: Record<string, string>;  // used when ContentSid configured ({"1": name, "2": url})
}): Promise<WaSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { ok: false, error: 'twilio_not_configured' };

  const contentSid = args.kind === 'invite'
    ? process.env.TWILIO_CONTENT_SID_INVITE
    : process.env.TWILIO_CONTENT_SID_REMINDER;

  const form = new URLSearchParams();
  form.set('To', `whatsapp:${args.toE164}`);
  form.set('From', from);
  form.set('StatusCallback', `${appBaseUrl()}/api/wa/status`);
  if (contentSid) {
    form.set('ContentSid', contentSid);
    form.set('ContentVariables', JSON.stringify(args.variables));
  } else {
    form.set('Body', args.body);
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15000)
    });
    const j = await res.json().catch(() => ({})) as { sid?: string; status?: string; message?: string; code?: number };
    if (!res.ok || !j.sid) {
      return { ok: false, error: `twilio_${j.code ?? res.status}: ${j.message ?? 'send failed'}` };
    }
    return { ok: true, sid: j.sid, status: j.status ?? 'queued' };
  } catch (e) {
    return { ok: false, error: `network: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/** Validate Twilio's X-Twilio-Signature (HMAC-SHA1 over url + sorted form params). */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
