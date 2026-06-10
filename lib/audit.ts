import { sql } from '@/lib/db';

export async function logAudit(args: {
  actorType: 'admin' | 'employee' | 'hod' | 'system';
  actorLabel?: string;
  action: string;
  appraisalId?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await sql()`INSERT INTO audit_log (actor_type, actor_label, action, appraisal_id, meta)
      VALUES (${args.actorType}, ${args.actorLabel ?? null}, ${args.action},
              ${args.appraisalId ?? null}, ${JSON.stringify(args.meta ?? {})}::jsonb)`;
  } catch { /* intentional: audit failure must never block the action */ }
}
