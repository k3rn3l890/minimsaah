/**
 * Build script to inject Supabase environment variables into HTML files
 * Run with: node scripts/inject-env.js
 * Requires: SUPABASE_URL and SUPABASE_ANON_KEY environment variables
 */
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set');
  process.exit(1);
}

const files = [
  'index.html',
  'article.html',
  'video.html',
  'documentary.html',
  'event.html',
  'articles.html',
  'documentaries.html',
  'admin/login.html',
  'admin/index.html',
  'admin/articles.html',
  'admin/videos.html',
  'admin/documentaries.html',
  'admin/events.html',
  'admin/ticker.html',
  'admin/media.html',
  'admin/profile.html',
  'admin/article-form.html',
  'admin/video-form.html',
  'admin/documentary-form.html',
  'admin/event-form.html',
];

const placeholderPattern = /<script>window\.__SUPABASE_URL = window\.__SUPABASE_URL \|\| ''; window\.__SUPABASE_ANON_KEY = window\.__SUPABASE_ANON_KEY \|\| '';<\/script>/;
const supabaseJsPattern = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"(?: integrity="[^"]+" crossorigin="anonymous")?><\/script>/;
// Pinned Supabase JS (must match the SRI-tagged script tags in HTML):
// update version + integrity together. Integrity generated with:
// node -e "console.log(require('crypto').createHash('sha384').update(require('fs').readFileSync('sb.js')).digest('base64'))"
// after downloading the exact file from cdn.jsdelivr.net.
const PINNED_SUPABASE_TAG = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2" integrity="sha384-WgXwGL6fUsYJWNaKJgVbrJKGRQwc1vieh2oy4kw9nXqpNDz3tdSsqEYUgeHD/NuF" crossorigin="anonymous"></script>';

function buildInjection() {
  return `<script>window.__SUPABASE_URL = '${supabaseUrl}'; window.__SUPABASE_ANON_KEY = '${supabaseAnonKey}';</script>`;
}

function injectIntoFile(relPath) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${relPath}`);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const injection = buildInjection();
  let updated = content;

  if (placeholderPattern.test(content)) {
    updated = content.replace(placeholderPattern, injection);
  } else if (!content.includes('window.__SUPABASE_URL')) {
    if (supabaseJsPattern.test(content)) {
      updated = content.replace(supabaseJsPattern, injection + '\n' + PINNED_SUPABASE_TAG);
    } else if (/<script/.test(content)) {
      updated = content.replace(/<script/, injection + '\n<script');
    } else {
      updated = content.replace('</head>', injection + '\n</head>');
    }
  } else {
    console.log(`Skipped (already injected): ${relPath}`);
    return;
  }

  fs.writeFileSync(fullPath, updated);
  console.log(`Injected Supabase config into ${relPath}`);
}

files.forEach(injectIntoFile);

console.log('Supabase config injected into all HTML files');
