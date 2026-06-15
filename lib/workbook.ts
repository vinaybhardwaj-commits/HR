/**
 * Dependency-free multi-sheet Excel workbook generator (SpreadsheetML 2003).
 * Produces a single XML string that opens natively in Excel and Google Sheets.
 * We avoid a real .xlsx (zip-of-xml) deliberately — no new npm dependency, which
 * keeps `npm ci` clean on Vercel. Content-Type: application/vnd.ms-excel.
 */

export interface WorkbookResultRow {
  emp_code: string; full_name: string; department: string | null; sub_department: string | null;
  designation: string | null; track: string; hod: string | null;
  total_score: number | null; percent: number | null; band: string | null; status: string;
  discussion_date: string | null; signoff: string | null; signed_name: string | null; signed_at: string | null;
}
export interface WorkbookCalibrationRow {
  hod: string; n: number; mean_pct: number | null; min_pct: number | null; max_pct: number | null;
  outstanding: number; commendable: number; adequate: number; inadequate: number;
}
export interface WorkbookBandRow { track: string; band: string; n: number; }
export interface WorkbookTrainingRow {
  emp_code: string; full_name: string; sub_department: string | null; category: string; detail: string | null;
}
export interface WorkbookData {
  cycle: { label: string; period_from: string; period_to: string; status: string; is_test: boolean; generated_at: string };
  summary: {
    employees: number; scored: number; signed: number; closed: number; pending_signoff: number;
    bands: { Outstanding: number; Commendable: number; Adequate: number; Inadequate: number };
  };
  results: WorkbookResultRow[];
  calibration: WorkbookCalibrationRow[];
  bands: WorkbookBandRow[];
  training: WorkbookTrainingRow[];
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function cell(v: unknown, style?: string): string {
  const styleAttr = style ? ` ss:StyleID="${style}"` : '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `<Cell${styleAttr}><Data ss:Type="Number">${v}</Data></Cell>`;
  }
  return `<Cell${styleAttr}><Data ss:Type="String">${esc(v)}</Data></Cell>`;
}

function row(cells: { v: unknown; style?: string }[]): string {
  return `<Row>${cells.map(c => cell(c.v, c.style)).join('')}</Row>`;
}
function headerRow(labels: string[]): string {
  return `<Row>${labels.map(l => cell(l, 'hdr')).join('')}</Row>`;
}
function sheet(name: string, rows: string[]): string {
  // Worksheet names: max 31 chars, no : \ / ? * [ ]
  const safe = name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);
  return `<Worksheet ss:Name="${esc(safe)}"><Table>${rows.join('')}</Table></Worksheet>`;
}

export function buildWorkbookXml(d: WorkbookData): string {
  const num = (v: number | null) => (v == null ? '' : Number(v));

  const summarySheet = sheet('Summary', [
    row([{ v: `EHRC Performance Appraisal — ${d.cycle.label}${d.cycle.is_test ? ' (TEST)' : ''}`, style: 'title' }]),
    row([{ v: `Period: ${d.cycle.period_from} to ${d.cycle.period_to}` }]),
    row([{ v: `Cycle status: ${d.cycle.status}` }]),
    row([{ v: `Generated: ${d.cycle.generated_at}` }]),
    row([{ v: '' }]),
    headerRow(['Metric', 'Count']),
    row([{ v: 'Employees in cycle' }, { v: d.summary.employees }]),
    row([{ v: 'Scored' }, { v: d.summary.scored }]),
    row([{ v: 'Signed off (concurred/disagreed/closed)' }, { v: d.summary.signed }]),
    row([{ v: 'Closed' }, { v: d.summary.closed }]),
    row([{ v: 'Scored but awaiting sign-off' }, { v: d.summary.pending_signoff }]),
    row([{ v: '' }]),
    headerRow(['Band (overall)', 'Count']),
    row([{ v: 'Outstanding (>80%)' }, { v: d.summary.bands.Outstanding }]),
    row([{ v: 'Commendable (>60%)' }, { v: d.summary.bands.Commendable }]),
    row([{ v: 'Adequate (>40%)' }, { v: d.summary.bands.Adequate }]),
    row([{ v: 'Inadequate (<=40%)' }, { v: d.summary.bands.Inadequate }]),
  ]);

  const resultsSheet = sheet('All employees', [
    headerRow(['Emp code', 'Name', 'Department', 'Sub-department', 'Designation', 'Track', 'HOD',
      'Total', 'Percent', 'Band', 'Status', 'Discussion date', 'Sign-off', 'Signed name', 'Signed at']),
    ...d.results.map(r => row([
      { v: r.emp_code }, { v: r.full_name }, { v: r.department }, { v: r.sub_department },
      { v: r.designation }, { v: r.track === 'C' ? 'Clinical' : r.track === 'N' ? 'Non-clinical' : r.track },
      { v: r.hod }, { v: num(r.total_score) }, { v: num(r.percent) }, { v: r.band }, { v: r.status },
      { v: r.discussion_date }, { v: r.signoff }, { v: r.signed_name }, { v: r.signed_at },
    ])),
  ]);

  const calibrationSheet = sheet('Calibration', [
    headerRow(['HOD', 'n', 'Mean %', 'Min %', 'Max %', 'Outstanding', 'Commendable', 'Adequate', 'Inadequate']),
    ...d.calibration.map(c => row([
      { v: c.hod }, { v: c.n }, { v: num(c.mean_pct) }, { v: num(c.min_pct) }, { v: num(c.max_pct) },
      { v: c.outstanding }, { v: c.commendable }, { v: c.adequate }, { v: c.inadequate },
    ])),
  ]);

  const bandSheet = sheet('Band distribution', [
    headerRow(['Track', 'Band', 'Count']),
    ...d.bands.map(b => row([
      { v: b.track === 'C' ? 'Clinical' : b.track === 'N' ? 'Non-clinical' : b.track }, { v: b.band }, { v: b.n },
    ])),
  ]);

  const trainingSheet = sheet('Training plan', [
    headerRow(['Emp code', 'Name', 'Sub-department', 'Category', 'Detail']),
    ...d.training.map(t => row([
      { v: t.emp_code }, { v: t.full_name }, { v: t.sub_department }, { v: t.category }, { v: t.detail },
    ])),
  ]);

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>
  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E8EAED" ss:Pattern="Solid"/></Style>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>
 </Styles>
 ${[summarySheet, resultsSheet, calibrationSheet, bandSheet, trainingSheet].join('\n ')}
</Workbook>`;
}
