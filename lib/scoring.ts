export type FactorSnapshot = { code: string; track: string; label: string; weight: number };

export const BANDS = [
  { name: 'Outstanding',  min: 81 },
  { name: 'Commendable',  min: 61 },
  { name: 'Adequate',     min: 41 },
  { name: 'Inadequate',   min: 0 }
] as const;

export function bandFor(percent: number): string {
  if (percent > 80) return 'Outstanding';
  if (percent > 60) return 'Commendable';
  if (percent > 40) return 'Adequate';
  return 'Inadequate';
}

/** Example text is mandatory for the extremes (anti-leniency / anti-severity guard). */
export function exampleRequired(value: number): boolean {
  return value === 1 || value === 2 || value === 5;
}

export function computeTotals(
  scores: { factor_code: string; value: number }[],
  factors: FactorSnapshot[]
): { total: number; max: number; percent: number; band: string } {
  const byCode = new Map(scores.map(s => [s.factor_code, s.value]));
  let total = 0, max = 0;
  for (const f of factors) {
    max += 5 * f.weight;
    const v = byCode.get(f.code);
    if (v) total += v * f.weight;
  }
  const percent = max > 0 ? Math.round((total / max) * 10000) / 100 : 0;
  return { total, max, percent, band: bandFor(percent) };
}

/** Factors applicable to one employee: ALL + their track, in sort order. */
export function factorsForTrack<T extends { track: string }>(all: T[], track: 'C' | 'N'): T[] {
  return all.filter(f => f.track === 'ALL' || f.track === track);
}
