/**
 * MINIMSAAH — secret sweep (Phase 2).
 * Run with: npm run audit
 * Scans git-tracked files for leaked secrets. Exit 1 on any hit.
 * The public anon key is safe by design (doors hold, not the key), but it
 * must NEVER appear as a real JWT in source — only placeholders and refs.
 */
const { execSync } = require('child_process');

const PATTERNS = [
  { name: 'JWT (eyJ...)', re: /eyJ[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'private key block', re: /BEGIN [A-Z ]*PRIVATE KEY/ },
  { name: 'live secret key (sk-live)', re: /sk-live-[A-Za-z0-9_-]{8,}/ },
  { name: 'postgres password URL', re: /postgres:\/\/[^:]+:([^@/\s]{1,64})@/ },
  // Hardcoded service-role assignment (env NAME alone is fine — a literal
  // key value assigned in source is never fine).
  { name: 'hardcoded service-role key', re: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]{20,}['"]/ },
  { name: 'supabase publishable/secret literal (sbp_)', re: /sbp_[A-Za-z0-9]{20,}/ },
];

function trackedFiles() {
  const out = execSync('git ls-files', { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

const fs = require('fs');
let hits = 0;
for (const f of trackedFiles()) {
  let text = '';
  try {
    text = fs.readFileSync(f, 'utf8');
  } catch (e) {
    continue; // binary or unreadable — skip
  }
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      console.error(`HIT ${p.name} in tracked file: ${f}`);
      hits++;
    }
  }
}

if (hits > 0) {
  console.error(`audit: ${hits} secret hit(s) in tracked files.`);
  process.exit(1);
}
console.log('audit: clean, no secrets in tracked files.');
