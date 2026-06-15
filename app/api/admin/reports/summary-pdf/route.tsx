import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BAND_ORDER = ['Outstanding', 'Commendable', 'Adequate', 'Inadequate'];
const SCORED_OR_BEYOND = new Set(['scored', 'discussed', 'concurred', 'disagreed', 'hr_review', 'closed']);
const SIGNED = new Set(['discussed', 'concurred', 'disagreed', 'hr_review', 'closed']);

const st = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1e293b' },
  brand: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9, color: '#64748b', marginTop: 2 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6,
        borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 3 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  stat: { width: '20%', marginBottom: 8 },
  statN: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  statL: { fontSize: 7.5, color: '#64748b' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 3 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingVertical: 3, fontFamily: 'Helvetica-Bold' },
  flag: { color: '#b45309' },
  foot: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 7.5, color: '#94a3b8', textAlign: 'center' }
});

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cycleId = Number(new URL(req.url).searchParams.get('cycle') ?? 0);
  if (!cycleId) return NextResponse.json({ error: 'cycle required' }, { status: 400 });
  const db = sql();

  const cyc = (await db`
    SELECT c.label, c.period_from::text AS period_from, c.period_to::text AS period_to, c.status,
           c.is_test, h.name AS hospital
    FROM cycle c JOIN hospital h ON h.id = c.hospital_id WHERE c.id = ${cycleId}`) as
    { label: string; period_from: string; period_to: string; status: string; is_test: boolean; hospital: string }[];
  if (!cyc[0]) return NextResponse.json({ error: 'cycle not found' }, { status: 404 });

  const statusRows = (await db`
    SELECT status, count(*)::int AS n FROM appraisal WHERE cycle_id = ${cycleId} GROUP BY status`) as
    { status: string; n: number }[];
  const bandsByTrack = (await db`
    SELECT e.track, a.band, count(*)::int AS n
    FROM appraisal a JOIN employee e ON e.id = a.employee_id
    WHERE a.cycle_id = ${cycleId} AND a.band IS NOT NULL
    GROUP BY e.track, a.band`) as { track: string; band: string; n: number }[];
  const calibration = (await db`
    SELECT ap.full_name AS hod, count(*)::int AS n, round(avg(a.percent), 1)::float8 AS mean_pct,
           count(*) FILTER (WHERE a.band = 'Outstanding')::int AS o,
           count(*) FILTER (WHERE a.band = 'Commendable')::int AS c,
           count(*) FILTER (WHERE a.band = 'Adequate')::int AS ad,
           count(*) FILTER (WHERE a.band = 'Inadequate')::int AS i
    FROM appraisal a JOIN appraiser ap ON ap.id = a.appraiser_id
    WHERE a.cycle_id = ${cycleId} AND a.percent IS NOT NULL
    GROUP BY ap.full_name ORDER BY count(*) DESC`) as
    { hod: string; n: number; mean_pct: number; o: number; c: number; ad: number; i: number }[];
  const cycMeanRow = (await db`
    SELECT round(avg(percent), 1)::float8 AS m FROM appraisal WHERE cycle_id = ${cycleId} AND percent IS NOT NULL`) as
    { m: number | null }[];
  const training = (await db`
    SELECT tn.category, count(*)::int AS n FROM training_need tn
    JOIN appraisal a ON a.id = tn.appraisal_id
    WHERE a.cycle_id = ${cycleId} GROUP BY tn.category ORDER BY count(*) DESC`) as
    { category: string; n: number }[];

  const cnt = (pred: (s: string) => boolean) => statusRows.filter(r => pred(r.status)).reduce((s, r) => s + r.n, 0);
  const cycMean = cycMeanRow[0]?.m ?? null;
  const bandCell = (track: string, band: string) => bandsByTrack.find(b => b.track === track && b.band === band)?.n ?? 0;
  const trackTotal = (track: string) => bandsByTrack.filter(b => b.track === track).reduce((s, b) => s + b.n, 0);

  const stats: [string, number][] = [
    ['In cycle', cnt(s => s !== 'cancelled')],
    ['Scored', cnt(s => SCORED_OR_BEYOND.has(s))],
    ['Accepted', cnt(s => SIGNED.has(s))],
    ['Closed', cnt(s => s === 'closed')],
    ['Awaiting 1:1', cnt(s => s === 'scored')],
  ];

  const doc = (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.brand}>EVEN <Text style={{ fontFamily: 'Helvetica' }}>· Appraisal Cycle Summary</Text></Text>
        <Text style={st.sub}>{cyc[0].hospital} · {cyc[0].label}{cyc[0].is_test ? ' (TEST)' : ''} ({cyc[0].period_from} to {cyc[0].period_to}) · status: {cyc[0].status}</Text>

        <Text style={st.h2}>Completion</Text>
        <View style={st.statRow}>
          {stats.map(([label, n]) => (
            <View key={label} style={st.stat}><Text style={st.statN}>{n}</Text><Text style={st.statL}>{label}</Text></View>
          ))}
        </View>

        <Text style={st.h2}>Band distribution by track</Text>
        <View style={st.th}>
          <Text style={{ width: '28%' }}>Track</Text>
          {BAND_ORDER.map(b => <Text key={b} style={{ width: '18%', textAlign: 'right' }}>{b}</Text>)}
        </View>
        {(['C', 'N'] as const).map(track => (
          <View key={track} style={st.tr}>
            <Text style={{ width: '28%' }}>{track === 'C' ? 'Clinical' : 'Non-clinical'} (n={trackTotal(track)})</Text>
            {BAND_ORDER.map(b => <Text key={b} style={{ width: '18%', textAlign: 'right' }}>{bandCell(track, b)}</Text>)}
          </View>
        ))}

        <Text style={st.h2}>Calibration by HOD{cycMean != null ? ` (cycle mean ${cycMean}%)` : ''}</Text>
        <View style={st.th}>
          <Text style={{ width: '40%' }}>HOD</Text>
          <Text style={{ width: '10%', textAlign: 'right' }}>n</Text>
          <Text style={{ width: '16%', textAlign: 'right' }}>Mean %</Text>
          <Text style={{ width: '34%', textAlign: 'right' }}>O / C / A / I</Text>
        </View>
        {calibration.map(c => {
          const outlier = cycMean != null && c.n >= 3 && Math.abs(c.mean_pct - cycMean) > 10;
          return (
            <View key={c.hod} style={st.tr}>
              <Text style={[{ width: '40%' }, outlier ? st.flag : {}]}>{c.hod}{outlier ? '  ⚠' : ''}</Text>
              <Text style={{ width: '10%', textAlign: 'right' }}>{c.n}</Text>
              <Text style={[{ width: '16%', textAlign: 'right' }, outlier ? st.flag : {}]}>{c.mean_pct}</Text>
              <Text style={{ width: '34%', textAlign: 'right' }}>{c.o} / {c.c} / {c.ad} / {c.i}</Text>
            </View>
          );
        })}
        {calibration.length === 0 && <Text style={st.sub}>No scored appraisals yet.</Text>}
        {calibration.some(c => cycMean != null && c.n >= 3 && Math.abs(c.mean_pct - cycMean) > 10) && (
          <Text style={[st.sub, { marginTop: 4 }]}>⚠ = mean &gt;10 points from the cycle mean (n≥3) — review for leniency/severity before close.</Text>
        )}

        <Text style={st.h2}>Training needs</Text>
        {training.map(t => <Text key={t.category} style={{ marginBottom: 2 }}>• {t.category} — {t.n}</Text>)}
        {training.length === 0 && <Text style={st.sub}>None recorded.</Text>}

        <Text style={st.foot} fixed>
          Even Appraise · cycle summary · generated {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC
        </Text>
      </Page>
    </Document>
  );

  const buf = await renderToBuffer(doc);
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'summary_pdf_generated', meta: { cycleId } });
  const safe = cyc[0].label.replace(/[^A-Za-z0-9._-]+/g, '-');
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="EHRC-cycle-summary-${safe}.pdf"`,
    },
  });
}
