# MINIMSAAH — Supabase beta (Pages + Supabase direct, no middleman)

Single project `minimsaah` holds DB + Storage. Data persists, `pg_dump` ready for later R2 move.

## 1. Create project (no card, free)
- `supabase.com` → New Project `minimsaah` → copy `SUPABASE_URL`, `anon key`, `service_role` key.
- `Database` → copy pooled `DATABASE_URL :6543?pgbouncer=true` (runtime) + direct `DIRECT_URL :5432` (migrate/dump).

## 2. Schema
- Option A (fresh): `npx prisma migrate deploy` against `DIRECT_URL` to create `20260919120856_init` tables, then `npx prisma db seed` recreates demo.
- Option B (migrate existing local dump, as requested): `pg_dump --data-only` local `postgresql://postgres:postgres@localhost:5432/minimsaah`, restore to `DIRECT_URL`. Skip `sessions`, migrate `users` profile only (passwords via auth-migrate.js).

## 3. Auth (keep admin123 for beta)
- Run: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/auth-migrate.js`
- Creates 5 users with same passwords, `user_metadata.role`, links `public.users.id = auth.id`.

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