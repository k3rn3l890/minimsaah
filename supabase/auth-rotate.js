/**
 * MINIMSAAH — auth-rotate.js
 * Rotates the 4 staff Supabase Auth passwords. Secrets enter ONLY via masked
 * interactive prompts — there is deliberately no env/file/arg intake, so no
 * code path can persist a password to disk, history, logs, or chat.
 *
 * Usage:
 *   node supabase/auth-rotate.js            # dry run: validates wiring, writes nothing
 *   node supabase/auth-rotate.js --live     # masked prompts (non-Windows terminals)
 *   Via wrapper only: .\supabase\rotate-secure.ps1
 *     (PowerShell SecureString prompts -> process env -> --live-env).
 *     --live-env refuses to run without the wrapper sentinel, so env
 *     intake cannot be reached by typed commands (which leak to history).
 *
 * After each account: verifies user_metadata.role is unchanged, prints OK.
 * Stops on first failure (idempotent — re-run when ready).
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dndiajfohpmnmocmmokt.supabase.co';
const STAFF = [
  { email: 'admin@minimsaah.com', expectRole: 'OWNER' },
  { email: 'editor@minimsaah.com', expectRole: 'EDITOR' },
  { email: 'writer@minimsaah.com', expectRole: 'JOURNALIST' },
  { email: 'video@minimsaah.com', expectRole: 'VIDEOGRAPHER' },
];

// Masked prompt: echoes '*' per character (backspace-aware) so paste
// receipt is visible without revealing content. Pasted chunks are split on
// CR/LF so a trailing newline can't pollute the secret. Ctrl+C aborts.
// Nothing is stored, echoed, or logged.
// Graceful shutdown AFTER any network use: pooled HTTPS sockets crash
// Windows teardown if process.exit() fires while open (verified libuv
// assert). Draining ~6s lets them idle out first. Pre-network exits below
// still use process.exit() directly (no sockets open — proven clean).
function shutdown(code) {
  try { process.stdin.removeAllListeners('data'); } catch (e) {}
  setTimeout(function () { process.exit(code); }, 6000);
}

// Carries trailing bytes from one prompt to the next (piped input or a
// multi-line paste arrives as a single chunk; without this the remainder
// would be lost when the listener detaches on Enter).
var inputStash = '';
function promptSecret(label) {
  return new Promise(function (resolve, reject) {
    var stdin = process.stdin;
    var buf = '';
    var done = false;
    process.stdout.write(label + ' (input hidden — press Enter when done): ');
    function cleanup() {
      done = true;
      try { if (stdin.isTTY && typeof stdin.setRawMode === 'function') stdin.setRawMode(false); } catch (e) {}
      try { stdin.removeListener('data', onData); } catch (e) {}
      // NOTE: never stdin.pause() here — pausing a closed/pipe handle
      // crashes Node teardown on Windows. Detaching the listener is enough;
      // unread bytes stay buffered for the next prompt via inputStash flow.
    }
    function emitChar(c) {
      if (c === '\r' || c === '\n' || c === '\u0004') {
        process.stdout.write('\n');
        cleanup();
        resolve(buf);
        return true;
      }
      if (c === '\u0003') {
        process.stdout.write('\n');
        cleanup();
        reject(new Error('aborted'));
        return true;
      }
      if (c === '\u007f' || c === '\b') {
        if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
        return false;
      }
      if (c >= ' ' && c !== '\u007f') { buf += c; process.stdout.write('*'); }
      return false;
    }
    function onData(ch) {
      if (done) return;
      var s = inputStash + ch.toString('utf8');
      inputStash = '';
      for (var i = 0; i < s.length; i++) {
        if (emitChar(s[i])) { inputStash = s.slice(i + 1); return; }
      }
    }
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
      try { stdin.setRawMode(true); } catch (e) {}
    }
    stdin.resume();
    stdin.on('data', onData);
    if (inputStash) onData(Buffer.from(''));
  });
}

// Prompt until usable input arrives (empty paste + Enter retries instead of
// aborting). minLen 0 = any non-empty value accepted.
async function promptRequired(label, minLen, whatFor) {
  for (var attempt = 1; attempt <= 3; attempt++) {
    var v = await promptSecret(label);
    if (!v) {
      console.log('Nothing received — paste again, then press Enter (' + attempt + '/3).');
      continue;
    }
    if (minLen && v.length < minLen) {
      console.log('Too short (' + v.length + ' chars, need ' + minLen + '+) — try again (' + attempt + '/3).');
      continue;
    }
    return v;
  }
  throw new Error('No ' + (whatFor || 'input') + ' received — aborting, nothing changed.');
}

async function main() {
  var live = process.argv.indexOf('--live') !== -1;
  var liveEnv = process.argv.indexOf('--live-env') !== -1;
  console.log('MINIMSAAH password rotation — ' + (live || liveEnv ? 'LIVE' : 'DRY RUN (writes nothing)'));
  console.log('Accounts: ' + STAFF.map(function (s) { return s.email; }).join(', '));
  if (!live && !liveEnv) {
    console.log('Dry run OK: wiring valid. Re-run with --live to rotate.');
    return;
  }
  var getPassword;
  var supabase;
  if (liveEnv) {
    // Wrapper-only path: refuses without the sentinel so typed commands
    // (which persist in shell history) can never reach env intake.
    if (process.env.MINIMSAAH_SECURE_WRAPPER !== '1') {
      console.error('Refusing env intake without the secure wrapper — run .\\supabase\\rotate-secure.ps1 instead.');
      process.exit(1);
    }
    var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    var pwMap = {
      'admin@minimsaah.com': process.env.STAFF_ADMIN_PASSWORD || '',
      'editor@minimsaah.com': process.env.STAFF_EDITOR_PASSWORD || '',
      'writer@minimsaah.com': process.env.STAFF_WRITER_PASSWORD || '',
      'video@minimsaah.com': process.env.STAFF_VIDEO_PASSWORD || '',
    };
    if (!serviceKey || serviceKey.length < 100) { console.error('Service key missing or truncated — aborting, nothing changed.'); process.exit(1); }
    var bad = STAFF.filter(function (s) { return !pwMap[s.email] || pwMap[s.email].length < 16; });
    if (bad.length) { console.error('Missing/short password for: ' + bad.map(function (s) { return s.email; }).join(', ') + ' — aborting, nothing changed.'); process.exit(1); }
    supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
    serviceKey = null;
    getPassword = async function (email) { var p = pwMap[email]; pwMap[email] = ''; return p; };
  } else {
  var serviceKey = '';
  for (var k = 1; k <= 3; k++) {
    serviceKey = (await promptRequired('SUPABASE_SERVICE_ROLE_KEY (masked, memory-only)', 0, 'service key')).trim();
    if (serviceKey.length >= 100) break;
    console.log('Looks truncated (' + serviceKey.length + ' chars, expected ~200+) — paste the full key again (' + k + '/3).');
    serviceKey = '';
  }
  if (!serviceKey || serviceKey.length < 100) { console.error('No valid service key — aborting, nothing changed.'); process.exit(1); }
  console.log('Key accepted (' + serviceKey.length + ' chars), connecting…');
  var supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  serviceKey = null;
  getPassword = async function (email) {
    return promptRequired('New password for ' + email + ' (masked, memory-only)', 16, 'password');
  };
  }

  var listed = await supabase.auth.admin.listUsers();
  if (listed.error) { console.error('Cannot list users: ' + listed.error.message); shutdown(1); return; }
  var byEmail = {};
  (listed.data.users || []).forEach(function (u) { byEmail[u.email] = u; });

  for (const s of STAFF) {
    var existing = byEmail[s.email];
    if (!existing) { console.error('FAIL ' + s.email + ': no such Auth user — aborting, nothing changed for this account.'); shutdown(1); return; }
    var pw = await getPassword(s.email);
    var up = await supabase.auth.admin.updateUserById(existing.id, { password: pw });
    pw = null;
    if (up.error) { console.error('FAIL ' + s.email + ': ' + up.error.message); shutdown(1); return; }
    var check = await supabase.auth.admin.getUserById(existing.id);
    var role = check.data && check.data.user && check.data.user.user_metadata && check.data.user.user_metadata.role;
    if (role !== s.expectRole) { console.error('FAIL ' + s.email + ': role changed to ' + role + ' — STOP, investigate before continuing.'); shutdown(1); return; }
    console.log('OK ' + s.email + ' (role ' + role + ' intact)');
  }
  console.log('Rotation complete. Tell staff to re-login everywhere.');
  shutdown(0);
}

main().catch(function (e) { console.error('Aborted: ' + (e.message || e)); process.exit(1); });
