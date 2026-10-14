# Contributing to MINIMSAAH

Small team rules. Speed with guardrails.

## Branches

- `main` deploys to production automatically. Never push blind: verify
  live after every push (home 200, one touched page 200, deploy hash
  matches your commit, `git status` clean).
- Work on short branches named `feat/...`, `fix/...`, `chore/...`.
  Merge via pull request. One reviewer minimum.
- `render-backend` sleeps the legacy Nest API. Do not touch unless the
  return decision is made and written here.

## Commits

- Prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.
- One idea per commit. Example: `fix: settings page sorts by key`.
- Empty trigger commits (`chore: trigger Vercel deploy ...`) only when
  the deploy list misses a push. Note it in the message.

## Review checklist (reviewer ticks all 10)

1. Live pages touched return 200, no console red errors.
2. No secrets, keys, or personal data in the diff.
3. New shared code goes in `assets/js/` or `admin/js/admin.js`,
   not pasted per page.
4. Inputs validated before save (length, shape, fixed lists).
5. Renders escape user text; no new raw-HTML sinks.
6. Public reads stay published-only; writes stay staff-gated.
7. No new dead fallbacks, hardcoded hosts, or twin files.
8. Mobile 375px + desk checked; reduced motion respected.
9. SQL changes include RLS in the same commit + `hardening.sql` passes.
10. Rollback noted: `git revert <sha>`, push, verify live.

## Before first commit (new engineers)

1. Read `README.md`, then `ARCHITECTURE.md`, then `supabase/README.md`.
2. Get Supabase anon key (pages) — never the service key.
3. Make one tiny docs fix as first PR to learn the ritual.
4. Shadow one deploy: push, watch deploy list, verify live, confirm clean.
