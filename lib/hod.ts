import { sql } from '@/lib/db';
import { resolvePortalToken, type TokenRow } from '@/lib/portal';

/** Resolve an HOD token and verify it owns the given appraisal. */
export async function resolveHodAppraisal(secret: string, appraisalId: string): Promise<
  { token: TokenRow; appraisal: { id: string; status: string; employee_id: number; cycle_id: number } } | null> {
  const t = await resolvePortalToken(secret);
  if (!t || t.role !== 'hod') return null;
  const rows = (await sql()`
    SELECT id, status, employee_id, cycle_id FROM appraisal
    WHERE id = ${appraisalId} AND cycle_id = ${t.cycle_id} AND appraiser_id = ${t.holder_id}`) as
    { id: string; status: string; employee_id: number; cycle_id: number }[];
  if (!rows[0]) return null;
  return { token: t, appraisal: rows[0] };
}

export type SnapshotFactor = {
  code: string; track: string; sort: number; label: string;
  description: string | null; anchors: Record<string, string>; weight: number;
};

export async function cycleFactorsForEmployee(cycleId: number, employeeId: number): Promise<SnapshotFactor[]> {
  const c = (await sql()`SELECT factor_snapshot FROM cycle WHERE id = ${cycleId}`) as
    { factor_snapshot: SnapshotFactor[] | null }[];
  const e = (await sql()`SELECT track FROM employee WHERE id = ${employeeId}`) as { track: string }[];
  const all = c[0]?.factor_snapshot ?? [];
  const track = e[0]?.track ?? 'N';
  return all.filter(f => f.track === 'ALL' || f.track === track)
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
}
