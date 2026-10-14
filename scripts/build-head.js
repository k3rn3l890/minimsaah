/**
 * MINIMSAAH — head partial injector (maintainability).
 * Run with: node scripts/build-head.js [--check]
 *
 * Single source of truth for the shared head core (font preconnects, font
 * CSS, compiled Tailwind link): partials/head-core.html. The 28 tracked
 * HTML files carry no pasted copy — this script stamps the partial into
 * each of them, preserving the file's own line endings (LF or CRLF).
 *
 * Order in build: build:css -> build-head -> inject-env -> sitemap.
 * inject-env stamps the tailwind link (?v=) afterwards, so this matcher
 * tolerates an existing stamp (local re-runs stay idempotent).
 *
 * --check: exit 1 if any tracked HTML lacks the partial or still carries
 * a stale variant (e.g. the old admin-only font URL). Used by CI.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTIAL = path.join(__dirname, '..', 'partials', 'head-core.html');

// One shared block, tolerant of: CRLF/LF, stamped/unstamped tailwind link,
// public (preconnects present) and admin (preconnects absent) variants.
const BLOCK_RE = /(?:<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\r?\n)?(?:<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\r?\n)?<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">\r?\n<link rel="stylesheet" href="\/assets\/css\/tailwind\.css(?:\?v=[A-Za-z0-9]+)?">/;

function htmlFiles() {
  const out = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .map((f) => f);
  for (const f of fs.readdirSync(path.join(ROOT, 'admin'))) {
    if (f.endsWith('.html')) out.push(`admin/${f}`);
  }
  return out;
}

function renderPartial(nl) {
  return fs.readFileSync(PARTIAL, 'utf8').replace(/\r?\n/g, '\n').split('\n').join(nl).replace(new RegExp(`${nl}$`), '');
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const partial = fs.readFileSync(PARTIAL, 'utf8');
  if (!partial.includes('/assets/css/tailwind.css')) {
    console.error('build-head: partials/head-core.html must contain the tailwind link.');
    process.exit(1);
  }
  let bad = 0;
  let stamped = 0;
  for (const rel of htmlFiles()) {
    const full = path.join(ROOT, rel);
    const content = fs.readFileSync(full, 'utf8');
    const nl = content.includes('\r\n') ? '\r\n' : '\n';
    const want = renderPartial(nl);
    if (content.includes(want)) continue;
    const next = content.replace(BLOCK_RE, () => want);
    if (next === content) {
      console.error(`build-head: no head block matched in ${rel}`);
      bad++;
      continue;
    }
    if (checkOnly) {
      console.error(`build-head: stale head block in ${rel} (run node scripts/build-head.js)`);
      bad++;
      continue;
    }
    fs.writeFileSync(full, next);
    stamped++;
  }
  if (bad) process.exit(1);
  console.log(checkOnly ? 'build-head: verified, all pages carry the shared head core.' : `build-head: stamped shared head core into ${stamped} file(s).`);
}

if (require.main === module) {
  try { main(); } catch (e) {
    console.error('build-head: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BLOCK_RE, htmlFiles, renderPartial };
}
