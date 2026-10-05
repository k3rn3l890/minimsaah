# MINIMSAAH — Supabase beta (Pages + Supabase direct, no middleman)

Single project `minimsaah` holds DB + Storage. Data persists, `pg_dump` ready for later R2 move.

## 1. Create project (no card, free)
- `supabase.com` → New Project `minimsaah` → copy `SUPABASE_URL`, `anon key`, `service_role` key.
- `Database` → copy pooled `DATABASE_URL :6543?pgbouncer=true` (runtime) + direct `DIRECT_URL :5432` (migrate/dump).

## 2. Schema
- Option A (fresh): `npx prisma migrate deploy` against `DIRECT_URL` to create `20260919120856_init` tables, then `npx prisma db seed` recreates demo.
- Option B (migrate existing local dump, as requested): `pg_dump --data-only` local `postgresql://postgres:postgres@localhost:5432/minimsaah`, restore to `DIRECT_URL`. Skip `sessions`, migrate `users` profile only (passwords via auth-migrate.js).

## 3. Auth (passwords live in your vault, never in this repo)
- New staff: Dashboard > Authentication > Users > Invite user (preferred).
- Re-provision only: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... STAFF_ADMIN_PASSWORD=... STAFF_EDITOR_PASSWORD=... STAFF_WRITER_PASSWORD=... STAFF_VIDEO_PASSWORD=... node supabase/auth-migrate.js`
- Creates 4 users with per-user passwords, `user_metadata.role`, links `public.users.id = auth.id`. Never re-run against live staff.

## 4. RLS + Storage — run in this order
- SQL Editor → run `supabase/schema.sql` FIRST (creates tables, fixes 42P01), then `supabase/rls.sql`, then `supabase/storage.sql`.
- Storage → New bucket `minimsaah-media` → Public ON.
- Upload `backend/uploads/*` to bucket, rewrite `http://localhost:3000/uploads/...` to `https://<ref>.supabase.co/storage/v1/object/public/minimsaah-media/...`.

## 5. Pages
- Connect `k3rn3l890/minimsaah` `main`, output `/`, env `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Add `https://<hash>.pages.dev` to Supabase Allowed Origins (CORS, 10 sec).
- Reads RLS-only fast, deletes/role changes via `functions/api/admin/*` holding `service_role`.

## 6. Keep Nest for later
- `main` is Pages-only. Nest lives in branch `render-backend`.
- On beta success: point `DATABASE_URL` to Supabase pooled, `npm run start:prod`, swap Pages reads back to `window.__API_BASE__`.

## 7. Safety rules for staff (read this before touching anything)
- `service_role` key lives ONLY in server doors (`functions/api/*` env) and local `auth-migrate.js`. NEVER paste it into pages, HTML, or `inject-env`. Pages use the `anon` key only — safe by design because door rules hold.
- Run `supabase/hardening.sql` in SQL Editor any time. It changes nothing. It raises on the first gap (door off, open write/delete, unpinned writer). `HARDENING OK` means pass.
- New tables need: RLS on, public read narrow, staff write, no public delete. Copy the tickers block in `rls.sql` as the pattern.
- Audit table: only bosses can read it. Watch for repeated `input_blocked` and `limit_hit` rows — same email again and again means attack. Suspend that user. Keep 30-day cleanup (see `audit.sql` bottom).
- Backups: weekly full export from Dashboard > Database > Backups (or `pg_dump` via `DIRECT_URL`). Test one restore on a throwaway project per quarter.
- Nest return checklist (do all before going live): password max 72, no fallback secret (refuse start if missing), close `/docs` on live, max length on every text field, generic error words only.