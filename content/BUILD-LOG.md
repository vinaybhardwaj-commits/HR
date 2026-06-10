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

## P4 Concurrence + review + close + PDF — 10 Jun 2026
- /me step ③④: full read-only assessment AFTER discussion marked (scores+levels+examples,
  band, training plan), Part D radio (agree / agree_remarks / disagree), remarks required for
  the latter two, typed-name e-sign validated against roster name; signed summary state.
- /api/me/concur: state-gated (discussed only), name match normalised, concurrence row +
  transition; disagree routes to HR.
- /admin/review: disagreement queue with employee remarks → "Mark resolved (uphold)" or
  "Reopen for re-scoring" (reopen clears totals/discussion/sign-off, scores back to draft).
- /api/admin/appraisals/[id]/action: override_self / cancel / resolve / reopen (reason
  required, audited). RowActions on cycle board: Unlock scoring (invited), Cancel, PDF (closed).
- Bulk close: "Close signed-off" on cycle page → concurred + hr_review → closed.
- PDF: on-demand via @react-pdf/renderer (NEW DEP) at GET /api/admin/appraisals/[id]/pdf —
  A4, Parts A–D, band, e-sign blocks, generation footer; no blob storage needed (data is
  frozen at close; PDF renders fresh each request, access audited).

## P5 WhatsApp-first distribution + reports + audit + mobile polish — 10 Jun 2026
- EMAIL FULLY SKIPPED by V's decision: distribution = links only.
- Links panel v2 (cycle page): search, pending-only filter, per-person live status
  (employee appraisal status / HOD x-of-y scored), per-row [WhatsApp] (wa.me share with
  pre-composed personal message incl. "do not forward"), [Copy message], [Copy link],
  bulk "Copy pending list" for employees/HODs = HR chase lists (replaces reminder cron).
- /admin/reports (cycle selector): calibration per HOD (n, mean/min/max %, O/C/A/I counts,
  leniency note), band distribution by track (bars), training-needs rollup with names;
  CSV download per report (/api/admin/reports/{calibration,bands,training}?cycle=N —
  bands CSV = full per-employee export).
- /admin/audit: last 200 events, filter by action substring + appraisal id.
- Mobile: explicit viewport (device-width, viewport-fit=cover) + theme color; sticky bars
  safe-area padded for iPhone; portals already 16px inputs + ≥44px touch targets.

## P6.1 is_test cycle flag + purge (B5) — 10 Jun 2026
- Migration 0007: cycle.is_test boolean NOT NULL DEFAULT false.
- Create-cycle form: "Test cycle" checkbox → POST /api/admin/cycles accepts is_test.
- TEST badge (purple) on cycles list + cycle detail; reports cycle selector marks
  "(TEST)" and DEFAULTS to the latest non-test cycle (test cycles stay selectable so
  the full report flow can be E2E-tested); dashboard "Live cycles" excludes test.
- POST /api/admin/cycles/[id]/purge: admin-gated, REFUSES non-test cycles (400),
  requires typed cycle-label confirmation, deletes in FK order (concurrence →
  training_need → score → email_log → appraisal → assignment → token → cycle).
  Audit rows kept; cycle_purge audit entry records per-table delete counts.
- UI: red "Purge test cycle" button on cycle detail (only when is_test), typed-label
  prompt, redirects to /admin/cycles on success.

## P7 REVERTED — 10 Jun 2026 (V decision: manual WhatsApp from phones, no Twilio)
- Full revert of `0eaa472`. Distribution stays the links panel (wa.me share + copy).
- DB note: migration 0008 had already been applied; the leftover `appraiser.phone`
  column and empty `wa_send_log` table are additive and harmless — left in place
  (additive-only migration discipline). No code references them.

## P6.2 mark/unmark test cycle — 10 Jun 2026
- Gap found by V: cycles created without the Test checkbox (or pre-0007) could never
  be deleted — purge refuses non-test and there was no way to flag after creation.
- POST /api/admin/cycles/[id]/test-flag {is_test} (admin-gated, audited cycle_test_flag).
- Cycle page: "Mark as test cycle…" (purple, with confirm explaining consequences) on
  non-test cycles; "Unmark test" next to Purge on test cycles.

## B9 launch timeout fix — 10 Jun 2026
- V report: "Launch cycle" hung; reload showed status live but only 13/74 invited.
- Cause: per-employee loop = ~370 sequential Neon HTTP round trips, each iad1→sin1
  (~250ms) → 60s maxDuration hit after ~13 employees; gateway killed the response so
  the button never resolved. Idempotent design meant re-runs would fill, but slowly.
- Fix 1: launch rewritten SET-BASED — assignments + appraisals as single INSERT…SELECT
  (appraisal ids via gen_random_uuid in SQL); missing tokens minted in JS and inserted
  per-role via ONE unnest() statement. ~10 statements total at any headcount.
- Fix 2: vercel.json "regions": ["sin1"] — functions now run next to the DB; every
  DB-touching page/API gets the latency win.
- Launch response now also returns totalAppraisals/totalTokens for verification.
