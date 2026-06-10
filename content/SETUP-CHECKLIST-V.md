# V's setup actions (one-time, ~10 min)

1. **Neon**: create project `even-appraise-db` (region ap-southeast-1/Singapore or same as other
   Even DBs) → copy the pooled connection string.
2. **Vercel**: New Project → import GitHub `vinaybhardwaj-commits/HR` → Framework: Next.js.
   Env vars (Production): `DATABASE_URL` (from Neon) · `JWT_SECRET` (long random) ·
   `MIGRATION_SECRET` (long random). Deploy once manually.
3. **Deploy hook**: Project Settings → Git → Deploy Hooks → create `redeploy` on main.
   (vercel.json has auto-deploy OFF, same as EHRC — POST the hook to deploy.)
4. **Migrate**: `curl -X POST https://<app-url>/api/admin/migrate -H "Authorization: Bearer $MIGRATION_SECRET"`
   → expect `{"applied":["0001…","0002…","0003…","0004…","0005…"],"errored":null}`
5. **First admin** (owner action): `curl -X POST https://<app-url>/api/admin/bootstrap
   -H "Authorization: Bearer $MIGRATION_SECRET" -H "Content-Type: application/json"
   -d '{"email":"vinay.bhardwaj@even.in","name":"Dr Vinay Bhardwaj","password":"<unique strong pw>"}'`
6. **Verify**: `/api/health` → ok · sign in at `/admin` → Dashboard shows 74 employees /
   20 appraisers / 13 factors · Roster page renders.
7. Later (P2 prereqs): Resend sender decision, `appraise.evenos.app` CNAME at GoDaddy,
   appraiser emails collected (see ROSTER-CLEANUP-REPORT.md).
