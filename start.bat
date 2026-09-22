@echo off
REM MINIMSAAH — Start both backend and public site (all files stay in minimsaah_v1)
REM No cloud needed, production-ready via .env

echo ============================================
echo   MINIMSAAH — Local News Platform (Ghana)
echo   All files: C:\Users\BREEZY\Desktop\PXL_INC\minimsaah_v1
echo ============================================
echo.

REM Check backend
if not exist "%~dp0backend\dist\main.js" (
  echo [1/3] Building backend…
  pushd "%~dp0backend"
  call npm run build
  popd
)

echo [1/3] Starting backend API on http://localhost:3000 …
echo       Swagger docs: http://localhost:3000/docs
echo       Uploads stay in: minimsaah_v1\backend\uploads
start "MINIMSAAH Backend (3000)" cmd /k "cd /d %~dp0backend && node dist\main.js"

echo [2/3] Starting public site on http://localhost:3000 (backend serves static) …
echo       Public:  http://localhost:3000/index.html
echo       Detail:  http://localhost:3000/article.html?slug=the-case-for-investment-why-african-football-s-economic-moment-is-now
echo       Video:   http://localhost:3000/video.html?slug=test-youtube-black-stars-goal
echo       Admin:   http://localhost:3000/admin/login.html  (admin@minimsaah.com / admin123)

timeout /t 4 /nobreak >nul

echo [3/3] Opening in browser…
start http://localhost:3000/index.html
start http://localhost:3000/admin/login.html

echo.
echo ============================================
echo   Running:
echo   - API + Public + Admin: http://localhost:3000
echo   - Uploads folder:       minimsaah_v1\backend\uploads
echo   - DB:                   minimsaah (Postgres localhost:5432)
echo.
echo   To switch to live/Postgres cloud:
echo     edit minimsaah_v1\backend\.env  -> DATABASE_URL, CORS_ORIGIN, BASE_URL
echo ============================================
echo.
echo Press any key to stop backend…
pause >nul
taskkill /FI "WINDOWTITLE eq MINIMSAAH Backend (3000)" /T /F >nul 2>&1
echo Stopped.
