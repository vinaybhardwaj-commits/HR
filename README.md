# even-appraise

Performance appraisal system for Even Healthcare hospitals (EHRC first).
Standalone app: Next.js 14 · Neon Postgres (HTTP driver) · Vercel · tokenised portals.

- Spec: `Daily Dash EHRC/HR-Appraisal/HR-APPRAISAL-TECH-SPEC.md` (+ PRD, form proposal)
- Build log: `content/BUILD-LOG.md` · Roster notes: `content/ROSTER-CLEANUP-REPORT.md`
- Deploy: Vercel deploy hook (auto-deploy on push is OFF via vercel.json)

## Surfaces
- `/me/[token]` employee workspace (P2) · `/hod/[token]` HOD queue (P3) · `/admin` HR command centre

## Env vars
`DATABASE_URL` · `JWT_SECRET` · `MIGRATION_SECRET` · (P2+: `RESEND_API_KEY`, `APP_BASE_URL`)

## Operations
- Migrate: `POST /api/admin/migrate` with `Authorization: Bearer $MIGRATION_SECRET`
- First admin (one-time, refuses if any admin exists):
  `POST /api/admin/bootstrap` Bearer $MIGRATION_SECRET, JSON `{email,name,password>=10}`
- Health: `GET /api/health`
