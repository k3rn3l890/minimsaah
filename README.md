# MINIMSAAH — Local News Platform (Ghana)

Sports journalism + video documentaries for upcoming footballers across Ghana.  
Public site is **plain HTML at `index.html`** (your approved design) — no React, no build. Admin and backend live in the same folder `minimsaah_v1`.

## Quick Start (localhost)

```bat
# All files stay in C:\Users\BREEZY\Desktop\PXL_INC\minimsaah_v1
# Double-click:
start.bat
# Or manually:
cd backend
npm run build
node dist/main.js
# then open http://localhost:3000/index.html
```

- API: `http://localhost:3000/api/v1` — docs at `http://localhost:3000/docs`
- Admin: `http://localhost:3000/admin/login.html` — `admin@minimsaah.com` / `admin123`
- Uploads: `backend/uploads` (all files stay on your computer)
- DB: Postgres `minimsaah` at `localhost:5432` (see `backend/.env`)

## Video — No Redirect, Thumbnail Stays

Paste any link in Admin → Videos:
- YouTube `https://www.youtube.com/watch?v=xxx` → thumbnail `https://img.youtube.com/vi/xxx/hqdefault.jpg`, embed `youtube-nocookie.com/embed/xxx`
- TikTok, Facebook, Instagram — auto thumbnail via oEmbed, fallback upload custom thumbnail
- Player: click thumbnail → `iframe` inside `minimsaah_v1` modal (`assets/js/player.js`), user never leaves site.

Backend auto-creates `embedUrl` + `thumbnail` at `backend/src/common/video-embed.util.ts`.

## Detail Pages — Like CNN

Click any headline → `article.html?slug=xxx`, `video.html?slug=xxx`, `documentary.html?slug=xxx`, `event.html?slug=xxx`  
Each is one file that reads `?slug=` and fetches `GET /api/v1/articles/:slug` etc. Related stories at bottom.

## Project Structure (all inside minimsaah_v1)

```
minimsaah_v1/
  index.html              # public homepage (your design, untouched)
  article.html?slug=xxx   # CNN-like detail
  video.html?slug=xxx     # in-site player, no redirect
  documentary.html        # long-form
  event.html              # promo
  assets/js/
    app.js                # hydrates home from API
    embeds.js             # 4-platform helpers
    player.js             # modal, stays on site
  admin/
    login.html, index.html, articles.html, article-form.html, videos.html, video-form.html, ...
    js/admin.js           # auth + api wrapper
  backend/
    src/                  # NestJS API
    prisma/schema.prisma  # DB
    uploads/              # all images stay here
    .env                  # localhost vs production switch
  start.bat
```

## Switch to Production (cloud Postgres / R2)

Edit `backend/.env`:
```
DATABASE_URL="postgresql://user:pass@prod-host:5432/minimsaah"
CORS_ORIGIN="https://your-domain.com"
BASE_URL="https://your-domain.com"
```
No code change needed.

## Demo Accounts (seed.ts)

- OWNER: `admin@minimsaah.com` / `admin123`
- EDITOR: `editor@minimsaah.com` / `admin123`
- JOURNALIST: `writer@minimsaah.com` / `writer123`
- VIDEOGRAPHER: `video@minimsaah.com` / `writer123`

## Tech

- Public: vanilla HTML + Tailwind CDN + GSAP/Lenis + 3 tiny JS files
- API: NestJS 11 + Prisma 6 + Postgres + JWT + Swagger
- Storage: local `backend/uploads` (ready for S3/R2 via BASE_URL)
