# MINIMSAAH

Sports journalism platform from Accra, Ghana. Static site on Vercel,
Supabase direct for data, one server door set. No middleman server live.

Live: `https://minimsaah.vercel.app` — Admin: `/admin/login.html`

## Start here (5 minutes)

1. Install Node 18 or newer. No build tools needed beyond that.
2. Copy nothing. Secrets live outside git:
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Vercel env vars (live site).
   - `SUPABASE_SERVICE_ROLE_KEY` only in `api/` and `functions/api/` env
     (server doors) and local `supabase/auth-migrate.js` runs. Never in pages.
3. Local preview: any static server at repo root, e.g.
   `npx serve .` — admin pages expect Supabase keys, so local admin
   works only against the live project or with keys injected.
4. Full local stack: `npx vercel dev` (needs a Vercel login).

## How a page loads (30 seconds)

1. Browser opens a static `.html` page (pre-rendered story pages exist
   under `article/`, `video/`, `documentary/`, `event/`).
2. Page script reads Supabase directly with the public `anon` key.
   Door rules in `supabase/*.sql` allow: public reads of published rows,
   staff writes, boss deletes. Nothing else.
3. Writes that need secrets (deletes, audit rows with caller address)
   go through `api/*` server doors holding the service key.
4. Staff console lives under `admin/`. Login needs staff role plus
   phone code if set. Idle 10 minutes warns, 15 minutes signs out.

## Deploy

- Push to `main` deploys to production automatically. Watch the deploy
  list: `gh api repos/k3rn3l890/minimsaah/deployments --jq '.[0].sha[0:7]'`
  must match your commit, with status `success`.
- If a push sits with no deploy for 10+ minutes, re-push an empty
  commit. If still stuck, check Vercel Dashboard → Deployments.
- Build runs `node scripts/inject-env.js && node scripts/sitemap.js`:
  keys injected, asset links stamped with the save id, sitemap plus
  pre-rendered story pages rebuilt. Needs the two Supabase env vars.
- Verify after every push: home 200, one story page 200, admin login
  loads, `git status` clean.

## Rollback

- Small fix: `git revert HEAD` then push. Deploys the previous state.
- Bigger: `git log --oneline`, pick the last good save id,
  `git revert` it, push, verify live as above.
- Browser rule emergency note lives in `CSP-REVERT-NOTE.txt`.

## Database changes

1. Edit the one owning SQL file under `supabase/` (schema, rls,
   storage, audit, sponsors, site_settings, contact, or a new file).
2. Run `supabase/hardening.sql` mentally: RLS on, public reads narrow,
   no public writes or deletes, writers pinned.
3. Paste into Supabase Dashboard → SQL Editor, in dependency order
   (helpers in `rls.sql` first). Run `hardening.sql` after: expect
   `HARDENING OK`.
4. Never paste the service key anywhere except server door env.

## Weekly 5-minute watch

- Supabase → Table Editor → `admin_audit`: repeated `input_blocked`
  or `limit_hit` from one email means attack. Same email plus same
  address is one person; many addresses is spread-out — suspend the user.
- `site_error` rows name broken pages. Fix, push, verify.
- Backups: Dashboard → Database → Backups weekly. Restore test on a
  throwaway project each quarter. Log dates below.

## Backup log

| Date | What | Restored? |
|---|---|---|
| _—_ | _none logged yet_ | _no_ |

## Docs map

- `ARCHITECTURE.md` — data flow, folder ownership, live-vs-dead map.
- `CONTRIBUTING.md` — branches, commits, review checklist.
- `supabase/README.md` — project setup, SQL run order, staff accounts.
- `supabase/rotate-secure.ps1` + `auth-rotate.js` — password rotation.
