# MINIMSAAH — Architecture

One picture in words: static pages plus Supabase direct plus two small
server doors. No live middleman server.

```
Visitor browser ──static HTML/JS/CSS──▶ Vercel CDN
        │  reads (anon key, door rules)      │  writes needing secrets
        ▼                                    ▼
Supabase Postgres + Storage         Vercel api/* doors (service key)
   (RLS: public reads published,         - POST /api/log-event (audit + IP)
    staff writes, boss deletes)          - (planned) POST /api/admin/delete
Staff browser ──▶ same Supabase direct + same doors + /admin/* pages
Build (Vercel): inject-env (keys + asset stamps) → sitemap (sitemap + pre-render)
```

## Folder ownership

| Path | Owns | Notes |
|---|---|---|
| `index.html`, `article.html`, `video.html`, `documentary.html`, `event.html`, `articles.html`, `videos.html`, `documentaries.html`, `contact.html`, `privacy.html`, `terms.html`, `404.html` | Public templates. Inline per-page script fills live data. | Source of truth for markup. |
| `article/`, `video/`, `documentary/`, `event/` | Generated pre-rendered story pages. Git-ignored, rebuilt every deploy. | Never edit by hand. |
| `admin/*.html` + `admin/js/admin.js` | Staff console: auth, CRUD, upload, guards, shared checker. | All admin writes flow through `admin.js` helpers. |
| `assets/js/` | Shared browser code: `supabase-client.js` (anon client), `app.js` (home fill), `embeds.js` + `player.js` (video), `contact.js` (chat), `watch.js` (error reports). | Extract shared helpers here, not per-page copies. |
| `api/` | LIVE server doors on Vercel (`log-event.js`). | Only `api/` deploys to Vercel. |
| `functions/` | Cloudflare Pages twins. NOT live (host is Vercel). | Port-then-remove target. Do not extend. |
| `backend/` | Legacy Nest API. NOT live, NOT tracked (gitignored). Lives on for localhost dev only. | Return-or-retire decision pending; do not wire new code to it. |
| `supabase/*.sql` | Database truth, applied by hand in dependency order: `schema` → feature tables → `rls` → `storage` → `audit` → extras. `hardening.sql` verifies, changes nothing. | One table, one owning file. |
| `scripts/` | `inject-env.js` (keys + stamps), `sitemap.js` (sitemap + pre-render). | Both must stay deterministic; no secrets in output. |
| `vercel.json` | THE header/routing config (CSP, rewrites, build command). | `_headers` is dead on Vercel. Ignore it. |

## Data doors (live)

| Door | Who | Rule file |
|---|---|---|
| Public reads (published rows, active tickers/sponsors, titles, contact insert) | anon key | `supabase/rls.sql`, `storage.sql`, `contact.sql`, `sponsors.sql`, `site_settings.sql` |
| Staff writes | staff JWT role | same files (`is_staff()`) |
| Boss deletes + role changes | OWNER/EDITOR via server door or trigger | `functions/api/admin/delete.js` (port pending), `rls.sql` trigger |
| Audit + view counts | allow-listed RPCs + `/api/log-event` | `audit.sql`, `api/log-event.js` |
| Media bytes | public read, staff upload, door-only delete | `storage.sql` + `minimsaah-media` bucket |

## Known dead-or-dying (do not build on these)

- `https://minimsaah-api.onrender.com` — dead API, returns 404. Links remain as fallback defaults; removal is a planned atomic commit (links + CSP + fallback branches together).
- `functions/` twins — dead on Vercel; `api/` is live. Change both until twins merge, then remove `functions/`.
- `_headers` — dead on Vercel; `vercel.json` wins.
- Test seed rows (fake video IDs) in public lists — hide or delete before big launch.
- `backend/` Nest — localhost dev only; no live path reaches it.
