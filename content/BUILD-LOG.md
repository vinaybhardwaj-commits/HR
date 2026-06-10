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
