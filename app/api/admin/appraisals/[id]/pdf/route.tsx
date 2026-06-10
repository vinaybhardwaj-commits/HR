import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { sql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { cycleFactorsForEmployee } from '@/lib/hod';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const LEVEL: Record<number, string> = { 5: 'Exceptional', 4: 'Exceeds', 3: 'Meets', 2: 'Partially meets', 1: 'Does not meet' };
const CHOICE: Record<string, string> = {
  agree: 'Agree', agree_remarks: 'Agree with remarks', disagree: 'Disagree'
};

const st = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1e293b' },
  brand: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9, color: '#64748b', marginTop: 2 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 5,
        borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  label: { fontFamily: 'Helvetica-Bold' },
  para: { marginBottom: 4, lineHeight: 1.4 },
  scoreRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', paddingVertical: 3 },
  band: { marginTop: 8, padding: 8, backgroundColor: '#eef2ff', borderRadius: 4,
          fontFamily: 'Helvetica-Bold', fontSize: 11, textAlign: 'center' },
  sig: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  sigBox: { width: '45%', borderTopWidth: 1, borderTopColor: '#94a3b8', paddingTop: 4, fontSize: 8.5 },
  foot: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 7.5, color: '#94a3b8', textAlign: 'center' }
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = (await sql()`
    SELECT a.*, a.percent::text AS percent_t, a.discussion_date::text AS disc_date,
           e.full_name, e.emp_code, e.designation, e.sub_department, e.track, e.id AS emp_id,
           ap.full_name AS hod_name, c.label AS cycle_label, c.period_from::text, c.period_to::text,
           c.id AS cyc_id, h.name AS hospital_name
    FROM appraisal a
    JOIN employee e ON e.id = a.employee_id
    JOIN appraiser ap ON ap.id = a.appraiser_id
    JOIN cycle c ON c.id = a.cycle_id
    JOIN hospital h ON h.id = c.hospital_id
    WHERE a.id = ${params.id}`) as Record<string, unknown>[];
  const a = rows[0];
  if (!a) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const factors = await cycleFactorsForEmployee(a.cyc_id as number, a.emp_id as number);
  const raw = (await sql()`SELECT factor_code, value, example_text FROM score
    WHERE appraisal_id = ${params.id} AND NOT is_draft`) as
    { factor_code: string; value: number; example_text: string | null }[];
  const byCode = new Map(raw.map(r => [r.factor_code, r]));
  const training = (await sql()`SELECT category, detail FROM training_need WHERE appraisal_id = ${params.id}`) as
    { category: string; detail: string | null }[];
  const conc = (await sql()`SELECT choice, remarks, signed_name, signed_at::text FROM concurrence
    WHERE appraisal_id = ${params.id}`) as
    { choice: string; remarks: string | null; signed_name: string; signed_at: string }[];
  const co = conc[0];
  const self = (a.self_json ?? {}) as {
    accomplishments?: string; challenges?: string; duty_changes?: string;
    goals?: { goal: string; measure: string }[]; training_wants?: string;
  };

  const doc = (
    <Document>
      <Page size="A4" style={st.page}>
        <Text style={st.brand}>EVEN <Text style={{ fontFamily: 'Helvetica' }}>· Performance Appraisal</Text></Text>
        <Text style={st.sub}>{String(a.hospital_name)} · {String(a.cycle_label)} ({String(a.period_from)} to {String(a.period_to)})</Text>

        <Text style={st.h2}>Employee</Text>
        <View style={st.row}><Text>{String(a.full_name)} ({String(a.emp_code)})</Text><Text>{String(a.designation ?? '')}</Text></View>
        <View style={st.row}><Text>{String(a.sub_department ?? '')} · {a.track === 'C' ? 'Clinical' : 'Non-clinical'} track</Text>
          <Text>Appraiser: {String(a.hod_name)}</Text></View>

        <Text style={st.h2}>Part A — Self-appraisal</Text>
        {self.accomplishments ? <Text style={st.para}><Text style={st.label}>Accomplishments: </Text>{self.accomplishments}</Text> : <Text style={st.para}>Not submitted.</Text>}
        {self.challenges ? <Text style={st.para}><Text style={st.label}>Challenges: </Text>{self.challenges}</Text> : null}
        {self.duty_changes ? <Text style={st.para}><Text style={st.label}>Changes to duties: </Text>{self.duty_changes}</Text> : null}
        {self.goals?.filter(g => g.goal).map((g, i) => (
          <Text key={i} style={st.para}><Text style={st.label}>Goal {i + 1}: </Text>{g.goal}{g.measure ? ` (measure: ${g.measure})` : ''}</Text>
        ))}
        {self.training_wants ? <Text style={st.para}><Text style={st.label}>Training requested: </Text>{self.training_wants}</Text> : null}

        <Text style={st.h2}>Part B — Assessment</Text>
        {factors.map(f => {
          const s = byCode.get(f.code);
          return (
            <View key={f.code} wrap={false}>
              <View style={st.scoreRow}>
                <Text style={{ width: '70%' }}>{f.code} · {f.label}</Text>
                <Text style={{ width: '30%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>
                  {s ? `${s.value} — ${LEVEL[s.value]}` : '—'}
                </Text>
              </View>
              {s?.example_text ? <Text style={{ fontSize: 8, color: '#64748b', marginBottom: 2 }}>Example: {s.example_text}</Text> : null}
            </View>
          );
        })}
        <Text style={st.band}>
          TOTAL {String(a.total_score)} / {factors.length * 5} · {String(a.percent_t)}% · {String(a.band ?? '').toUpperCase()}
        </Text>

        {training.length > 0 && (
          <>
            <Text style={st.h2}>Part C — Training needs</Text>
            {training.map((t, i) => <Text key={i} style={st.para}>• {t.category}{t.detail ? ` — ${t.detail}` : ''}</Text>)}
          </>
        )}

        <Text style={st.h2}>Part D — Discussion & concurrence</Text>
        <Text style={st.para}>Appraisal discussion held on: {String(a.disc_date ?? '—')}</Text>
        {co ? (
          <>
            <Text style={st.para}><Text style={st.label}>Employee response: </Text>{CHOICE[co.choice]}</Text>
            {co.remarks ? <Text style={st.para}><Text style={st.label}>Remarks: </Text>{co.remarks}</Text> : null}
            {a.hr_notes ? <Text style={st.para}><Text style={st.label}>HR resolution: </Text>{String(a.hr_notes)}</Text> : null}
          </>
        ) : <Text style={st.para}>Awaiting employee sign-off.</Text>}

        <View style={st.sig}>
          <View style={st.sigBox}>
            <Text>APPRAISEE: {co ? `${co.signed_name} (e-signed ${co.signed_at?.slice(0, 16)})` : '—'}</Text>
          </View>
          <View style={st.sigBox}>
            <Text>APPRAISER: {String(a.scored_by_label ?? a.hod_name)} (submitted {String(a.scores_submitted_at ?? '').slice(0, 16) || '—'})</Text>
          </View>
        </View>

        <Text style={st.foot} fixed>
          Generated by Even Appraise · {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · status: {String(a.status)}
        </Text>
      </Page>
    </Document>
  );

  const buf = await renderToBuffer(doc);
  await logAudit({ actorType: 'admin', actorLabel: admin.email, action: 'pdf_generated', appraisalId: params.id });
  const fname = `${String(a.cycle_label).replace(/\s+/g, '-')}-${String(a.emp_code)}-${String(a.full_name).replace(/\s+/g, '-')}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fname}"`
    }
  });
}
