/**
 * MINIMSAAH — backup restore check (Phase: ops).
 * Run with: npm run backup:check            (safe, no database touched)
 *           node scripts/backup-restore.js --help
 *
 * Full test needs TWO Postgres connection strings as env vars only:
 *   BACKUP_PROD_DB_URL  - read-only dump source (live project). Never written to.
 *   BACKUP_TEST_DB_URL  - throwaway project. The ONLY write target.
 *   BACKUP_TEST_TAG     - must appear inside BACKUP_TEST_DB_URL (default: 'test').
 *                         Stops accidents: prod ref can never match this tag.
 *
 * Safety rules (hard):
 * 1. No TEST url = no write step runs. The script stops.
 * 2. TEST url equal to PROD url = stop.
 * 3. TEST url missing BACKUP_TEST_TAG = stop.
 * 4. Secrets never printed. Logs show masked hosts only.
 * 5. Dump file lives in the OS temp dir and is deleted after (unless --keep).
 *
 * Needs Postgres tools once: pg_dump, pg_restore, psql in PATH.
 * Windows: install PostgreSQL (tools only) or use `winget install PostgreSQL.17`.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TABLES = ['articles', 'videos', 'documentaries', 'events', 'tickers', 'media'];

function parseArgs(argv) {
  const a = { help: false, check: false, dumpOnly: false, keep: false };
  for (const t of argv) {
    if (t === '--help') a.help = true;
    else if (t === '--check') a.check = true;
    else if (t === '--dump-only') a.dumpOnly = true;
    else if (t === '--keep') a.keep = true;
  }
  return a;
}

// Hide password: DB-URI user:PASS@host becomes user:***@host.
// (Written without a literal URI scheme so the secret sweep stays strict.)
function maskUrl(u) {
  try {
    return String(u || '').replace(/(postgres(?:ql)?:\/\/[^:/?#]+:)([^@/?#]+)(@)/, '$1***$3');
  } catch (e) { return '(unreadable url)'; }
}

function normUrl(u) {
  return String(u || '').trim().replace(/;$/, '');
}

function urlsDiffer(prod, test) {
  const p = normUrl(prod);
  const t = normUrl(test);
  if (!p || !t) return false;
  // Compare without password so same-host different-password still counts as same.
  const strip = (s) => s.replace(/(postgres(?:ql)?:\/\/[^:/?#]+:)[^@/?#]+(@)/, '$1$2').toLowerCase();
  return strip(p) !== strip(t);
}

function testTagOk(testUrl, tag) {
  const need = String(tag || 'test').toLowerCase();
  if (!need) return false;
  return normUrl(testUrl).toLowerCase().includes(need);
}

// Gate before ANY write step. Returns { ok, reason }.
function guardWrite(prodUrl, testUrl, tag) {
  if (!testUrl) return { ok: false, reason: 'BACKUP_TEST_DB_URL is missing. Set it to the throwaway project. Stopped.' };
  if (!urlsDiffer(prodUrl, testUrl)) return { ok: false, reason: 'TEST url equals PROD url. Refusing to write. Stopped.' };
  if (!testTagOk(testUrl, tag)) {
    return { ok: false, reason: `TEST url lacks tag '${tag}'. Set BACKUP_TEST_TAG to part of the throwaway project ref. Stopped.` };
  }
  return { ok: true, reason: '' };
}

function toolVersion(tool, args) {
  try {
    const out = execFileSync(tool, args || ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return String(out).trim().split('\n')[0];
  } catch (e) { return ''; }
}

function checkTools() {
  const found = {};
  for (const t of ['pg_dump', 'pg_restore', 'psql']) found[t] = toolVersion(t, ['--version']);
  return found;
}

function psqlCount(dbUrl, table) {
  const out = execFileSync('psql', [normUrl(dbUrl), '-tAc', `SELECT count(*) FROM public.${table};`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const n = parseInt(String(out).trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`bad count for ${table}: ${out}`);
  return n;
}

function helpText() {
  return [
    'backup-restore.js — prove a backup restores.',
    '',
    '  npm run backup:check                          safe: checks tools only, touches nothing',
    '  node scripts/backup-restore.js --dump-only     dumps PROD to temp file, no restore',
    '  node scripts/backup-restore.js                 full: dump PROD, restore to TEST, compare counts',
    '',
    'Env (never commit these):',
    '  BACKUP_PROD_DB_URL   live project Postgres URI (read: dump + SELECT counts)',
    '  BACKUP_TEST_DB_URL   throwaway project Postgres URI (only write target)',
    '  BACKUP_TEST_TAG      must appear in TEST url (default "test")',
    '',
    'Counts compared on: ' + TABLES.join(', '),
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  const tools = checkTools();
  const missing = Object.keys(tools).filter((t) => !tools[t]);
  if (args.check) {
    for (const t of Object.keys(tools)) console.log(`${t}: ${tools[t] || 'MISSING'}`);
    if (missing.length) {
      console.error(`backup: missing tools: ${missing.join(', ')}. Install Postgres tools, then re-run.`);
      process.exit(1);
    }
    console.log('backup: tools ready. Env presence (values never shown): '
      + `PROD=${process.env.BACKUP_PROD_DB_URL ? 'set' : 'missing'} `
      + `TEST=${process.env.BACKUP_TEST_DB_URL ? 'set' : 'missing'}`);
    return;
  }
  if (missing.length) {
    console.error(`backup: missing tools: ${missing.join(', ')}. Run npm run backup:check first.`);
    process.exit(1);
  }
  const prodUrl = normUrl(process.env.BACKUP_PROD_DB_URL || '');
  const testUrl = normUrl(process.env.BACKUP_TEST_DB_URL || '');
  const tag = process.env.BACKUP_TEST_TAG || 'test';
  if (!prodUrl) {
    console.error('backup: BACKUP_PROD_DB_URL is missing. Stopped.');
    process.exit(1);
  }
  if (!args.dumpOnly) {
    const g = guardWrite(prodUrl, testUrl, tag);
    if (!g.ok) {
      console.error('backup: ' + g.reason);
      process.exit(1);
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpFile = path.join(os.tmpdir(), `minimsaah-backup-${stamp}.dump`);
  console.log(`backup: dumping PROD (${maskUrl(prodUrl)}) ...`);
  execFileSync('pg_dump', [prodUrl, '-Fc', '-f', dumpFile], { stdio: 'inherit' });
  console.log(`backup: dump saved (${dumpFile})`);
  if (args.dumpOnly) {
    console.log('backup: dump-only done. No restore ran.');
    return;
  }
  console.log(`backup: restoring to TEST (${maskUrl(testUrl)}) ...`);
  execFileSync('pg_restore', ['--clean', '--if-exists', '-d', testUrl, dumpFile], { stdio: 'inherit' });
  console.log('backup: restore done. Comparing counts ...');
  let fail = 0;
  for (const t of TABLES) {
    const a = psqlCount(prodUrl, t);
    const b = psqlCount(testUrl, t);
    const same = a === b;
    if (!same) fail++;
    console.log(`  ${t}: prod=${a} test=${b} ${same ? 'OK' : 'MISMATCH'}`);
  }
  if (!args.keep) {
    try { fs.unlinkSync(dumpFile); console.log('backup: temp dump deleted.'); } catch (e) {}
  } else {
    console.log(`backup: temp dump kept at ${dumpFile} (--keep). Delete it by hand.`);
  }
  if (fail) {
    console.error(`backup: FAILED — ${fail} table(s) differ. Do not log a pass.`);
    process.exit(1);
  }
  console.log('backup: PASS — restore works. Log the date in README backup log, then delete the throwaway project.');
}

if (require.main === module) {
  try { main(); } catch (e) {
    console.error('backup: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseArgs, maskUrl, urlsDiffer, testTagOk, guardWrite, TABLES };
}
