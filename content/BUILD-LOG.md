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

## WhatsApp message copy — full name — 10 Jun 2026
- V: greeting must use the FULL roster name, not first token ("Dear A," for initial-
  first names). waMessage() now uses l.name verbatim for employees and HODs.

## P8 Roster management — 10 Jun 2026
- Add employee (code/name/dept/sub-dept/designation/track/HOD; dup-code 409; live-cycle
  hint: re-run launch to mint their appraisal+link). Add HOD (dup-name guard; gets a
  queue link once mapped + launch re-run).
- HOD remap per row. LATERAL MOVE RULE (V): live-cycle appraisal NOT yet scored
  (invited/self_submitted) moves to the new HOD immediately (appraisal + assignment
  updated, HOD link minted if missing); scored/discussed stays with the scorer for the
  cycle — future cycles follow the new mapping. Row reports which happened.
- Track edit (guarded: refused once scores exist in a live cycle). Deactivate/
  reactivate employees (leavers; open-appraisal warning). Deactivate HOD only when
  no active employees mapped (server 409 + disabled button).
- APIs: POST/PATCH /api/admin/roster/{employees,appraisers}[/id] — all audited.
- Roster page now shows inactive rows dimmed; PageHelp rewritten for management.

## Add-admin endpoint — 10 Jun 2026
- POST /api/admin/admins (Bearer MIGRATION_SECRET): create additional HR admins —
  bootstrap is one-time-only and /admin/settings (B8) is not built yet. Dup-email
  409, bcrypt-12, role 'super', audited. Owner runs the curl (same protocol as
  reset-password); account creation is never done by the assistant.

## P9 Live dashboard + portal feedback + versioning — 10 Jun 2026 (V device-test feedback)
- DASHBOARD = live command centre: per live cycle (incl. TEST, badged) — signed-off
  progress bar, status funnel chips, "Waiting on employee" + "Waiting on HOD" lists
  (name → HOD, days waiting, red at 7d/3d), HOD progress table (awaiting self / to
  score / discussion pending / done, sorted by most-behind), recent-activity feed
  (humanised audit events) + link to full audit. AutoRefresh component: router.refresh()
  every 30s with live indicator.
- Employee submit: proper completion screen (big check, "what happens next" steps,
  keep-your-link note). /me greeting now full name (split-first-token bug).
- HOD submit: green acknowledgement panel (name, total, %, band, "discussion releases
  the assessment"), submit button locks while saving, 409 now returns
  error=already_submitted + clear message (client shows it plainly and refreshes).
  Reopened appraisals show amber "editing version N+1, previous on record" banner.
- Version control (V choice: audit snapshot): HR reopen freezes the complete prior
  submission (all scores+examples+totals+band+scorer+discussion date) into audit_log
  as score_version_snapshot v{N} BEFORE clearing. Blocked re-submits logged
  (score_submit_blocked) — every attempt is on record.

## P10 Master HOD command centre — 11 Jun 2026 (V request, discussed first)
- Replaces the dashboard HOD progress table with a per-HOD command centre (all five
  elements V approved + expandable rows):
  1. Engagement: per-HOD link usage — "active Xm/h/d ago" (token.last_used_at) or red
     "never opened link".
  2. Sitting time: red badges when ready-to-score items sit ≥3d or discussions pend ≥7d
     (per-item days in the drill-down too).
  3. Progress bars per HOD (green done / violet discussion-pending / amber to-score),
     sorted most-behind first (to-score desc, then never-opened, then disc-pending).
  4. One-tap "WhatsApp chase" per row (pre-written message with their pending count +
     queue link, derived server-side from secret_enc like the links panel).
  5. Calibration early-warning: purple "calibration ⚠" chip when an HOD's mean % is
     >10pp off the cycle mean with n≥3 (tooltip shows both).
- Click a row → expands to their team with per-person status + waiting days.

## P11 Scoring browser module — 11 Jun 2026 (V request)
- NEW sidebar module "Scoring" (/admin/scoring): cycle selector → every HOD with their
  team; per row: status chip, total/%/band once scored, amber "draft · N factors" chip
  while the HOD is mid-scoring, purple vN chip on reopened appraisals. Click → detail.
- NEW /admin/appraisals/[id]: full read-only appraisal — Part A (incl. satisfaction
  answer, marked HR-ONLY), Part B per-factor scores with anchor text + HOD examples
  (+ draft markers), totals/band/scorer/discussion, training needs, Part D sign-off,
  HR notes, version indicator. Every view audit-logged (appraisal_viewed).
- Cycle board employee names now link to the detail page.
