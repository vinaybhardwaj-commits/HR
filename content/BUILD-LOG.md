# even-appraise — Build Log

## P1 Foundation — 10 Jun 2026
- Repo scaffolded: Next 14.2 + TS + Tailwind; deps: @neondatabase/serverless ^1, jose, bcryptjs.
- Migrations 0001–0003 (schema per tech spec §3), 0004 factor seed (13 factors × 5-level anchors,
  pending HR sign-off), 0005 EHRC roster seed (74 employees, 20 appraisers, normalised — see
  ROSTER-CLEANUP-REPORT.md). Schema delta vs spec: added `employee.default_appraiser_id`
  (default HOD mapping lives on roster; copied to `assignment` at cycle launch) and
  `appraisal.cancelled_reason`.
- Migration runner: quote-aware statement splitter (Neon HTTP = one statement per query).
- Admin auth: bcrypt-12, JWT HS256 cookie (12h), login lockout 5 fails → 15 min (day-1 feature).
- Bootstrap endpoint for first admin (MIGRATION_SECRET-gated, refuses if admin exists) — V runs it.
- Pages: /admin login, /admin/dashboard (counts), /admin/roster (74-row table, read-only).
- NOT in P1: cycles, tokens/portals, emails, PDFs, reports (P2–P5 per spec §10).

## P2 Cycle engine + employee portal — 10 Jun 2026
- Migration 0006: token.secret_enc (AES-256-GCM, key derived from JWT_SECRET) so HR can
  re-copy portal links anytime; lookup stays sha256-hash-only.
- Cycle APIs: create, idempotent launch (factor snapshot → assignments from
  employee.default_appraiser_id → appraisals apr_* → employee+HOD tokens, 1y expiry),
  board, links (decrypts, audited).
- Admin UI: Cycles list/create, cycle detail (status chips funnel, board table,
  Launch + Show-portal-links with per-person Copy buttons).
- Employee portal /me/[token]: 4-step stepper; state ① Part A form (3 free-text Qs,
  1–3 goals+measures, training wants, optional satisfaction 1–5 HR-only) with 800ms
  autosave + submit confirm; state ② wait card; friendly invalid-link page.
- Email distribution deliberately deferred: roster has no email addresses; links are
  copy-distributed (WhatsApp/print) per spec §4. Resend wiring = P4 alongside addresses.

## P3 HOD queue + scoring — 10 Jun 2026
- /hod/[token]: actionability-grouped queue (ready to score / draft / waiting / discussion pending / done),
  progress bar, aging on ready items; waiting rows not clickable.
- /hod/[token]/a/[id]: ownership-checked scoring view — Part A read-only (split desktop / tabs mobile),
  factor cards from cycle snapshot (ALL + track), tap-a-score shows that level's anchor, example
  required for 1/2/5 (amber outline until filled), training needs (≤3, category+detail),
  1.2s autosave + Save draft + gated Submit (9/9 + examples), live total/%/band sticky bar;
  after submit → date picker + "Discussion held" (scored → discussed); read-only afterwards.
- APIs /api/hod/score (draft upsert + submit with server-side validation + totals) and
  /api/hod/discussion; both resolve token AND verify appraisal belongs to that appraiser (no IDOR).
- Employee /me page now advances to step ③ display when discussed (full read-only view + concurrence = P4).
