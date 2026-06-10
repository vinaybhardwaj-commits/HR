import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { mintToken } from '@/lib/tokens';
import { encryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/**
 * Edit an employee: remap HOD, change track, activate/deactivate.
 * REMAP RULE (V decision, 10 Jun 2026): in live cycles, an UNSCORED appraisal
 * (invited / self_submitted) follows the employee to the new HOD immediately
 * (appraisal + assignment move; new HOD link minted if missing). A scored or
 * discussed appraisal stays with the scoring HOD for this cycle — only future
 * cycles follow the new mapping. The response reports which happened.
 * TRACK GUARD: refused while scores exist in a live cycle (factor set differs).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = Number(params.id);
  const b = await req.json().catch(() => null) as
    { default_appraiser_id?: number; track?: string; active?: boolean } | null;
  if (!b) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const db = sql();

  const cur = (await db`
    SELECT id, full_name, track, active, default_appraiser_id FROM employee WHERE id = ${id}`) as
    { id: number; full_name: string; track: string; active: boolean; default_appraiser_id: number }[];
  if (!cur[0]) return NextResponse.json({ error: 'employee not found' }, { status: 404 });

  const moved: { cycle: string }[] = [];
  const kept: { cycle: string; status: string }[] = [];
  const notes: string[] = [];

  // --- Track change (guarded) ---
  if (b.track !== undefined && b.track !== cur[0].track) {
    if (b.track !== 'C' && b.track !== 'N') return NextResponse.json({ error: 'track must be C or N' }, { status: 400 });
    const scored = (await db`
      SELECT count(*)::int AS n FROM score s
      JOIN appraisal a ON a.id = s.appraisal_id
      JOIN cycle c ON c.id = a.cycle_id
      WHERE a.employee_id = ${id} AND c.status = 'live'`) as { n: number }[];
    if (scored[0].n > 0) {
      return NextResponse.json({ error: 'cannot change track: scores already exist in a live cycle (cancel or reopen that appraisal first)' }, { status: 409 });
    }
    await db`UPDATE employee SET track = ${b.track} WHERE id = ${id}`;
    notes.push(`track ${cur[0].track} → ${b.track}`);
  }

  // --- Active toggle ---
  if (b.active !== undefined && b.active !== cur[0].active) {
    await db`UPDATE employee SET active = ${b.active} WHERE id = ${id}`;
    notes.push(b.active ? 'reactivated' : 'deactivated');
    if (!b.active) {
      const open = (await db`
        SELECT c.label FROM appraisal a JOIN cycle c ON c.id = a.cycle_id
        WHERE a.employee_id = ${id} AND c.status = 'live' AND a.status NOT IN ('cancelled','closed')`) as { label: string }[];
      if (open.length) notes.push(`open appraisal in ${open.map(o => o.label).join(', ')} — use Cancel on the cycle board if they have left`);
    }
  }

  // --- HOD remap ---
  if (b.default_appraiser_id !== undefined && b.default_appraiser_id !== cur[0].default_appraiser_id) {
    const hod = (await db`SELECT id, full_name FROM appraiser WHERE id = ${b.default_appraiser_id} AND active`) as
      { id: number; full_name: string }[];
    if (!hod[0]) return NextResponse.json({ error: 'new HOD not found or inactive' }, { status: 400 });
    await db`UPDATE employee SET default_appraiser_id = ${b.default_appraiser_id} WHERE id = ${id}`;

    const liveAppr = (await db`
      SELECT a.id, a.status, a.cycle_id, c.label FROM appraisal a
      JOIN cycle c ON c.id = a.cycle_id
      WHERE a.employee_id = ${id} AND c.status = 'live' AND a.status NOT IN ('cancelled','closed')`) as
      { id: string; status: string; cycle_id: number; label: string }[];

    for (const a of liveAppr) {
      if (a.status === 'invited' || a.status === 'self_submitted') {
        await db`UPDATE appraisal SET appraiser_id = ${b.default_appraiser_id} WHERE id = ${a.id}`;
        await db`UPDATE assignment SET appraiser_id = ${b.default_appraiser_id}
                 WHERE cycle_id = ${a.cycle_id} AND employee_id = ${id}`;
        const tok = (await db`
          SELECT id FROM token WHERE cycle_id = ${a.cycle_id} AND role = 'hod'
            AND holder_type = 'appraiser' AND holder_id = ${b.default_appraiser_id} AND NOT revoked`) as { id: number }[];
        if (!tok[0]) {
          const { secret, hash } = mintToken();
          await db`INSERT INTO token (token_hash, role, holder_type, holder_id, cycle_id, label, expires_at, secret_enc)
                   VALUES (${hash}, 'hod', 'appraiser', ${b.default_appraiser_id}, ${a.cycle_id}, ${hod[0].full_name},
                           now() + interval '1 year', ${encryptSecret(secret)})`;
        }
        moved.push({ cycle: a.label });
      } else {
        kept.push({ cycle: a.label, status: a.status });
      }
    }
    notes.push(`HOD → ${hod[0].full_name}`);
  }

  if (!notes.length && !moved.length && !kept.length) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'employee_update',
    meta: { id, name: cur[0].full_name, notes, moved, kept } });
  return NextResponse.json({ ok: true, notes, moved, kept });
}
