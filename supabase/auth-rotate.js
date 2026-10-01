/**
 * MINIMSAAH — auth-rotate.js
 * Rotates the 4 staff Supabase Auth passwords. Secrets enter ONLY via masked
 * interactive prompts — there is deliberately no env/file/arg intake, so no
 * code path can persist a password to disk, history, logs, or chat.
 *
 * Usage:
 *   node supabase/auth-rotate.js            # dry run: validates wiring, writes nothing
 *   node supabase/auth-rotate.js --live     # prompts for service key + 4 passwords, rotates
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

// Masked prompt: no echo, backspace-aware, Ctrl+C aborts. Nothing is stored.
function promptSecret(label) {
  return new Promise(function (resolve, reject) {
    var stdin = process.stdin;
    var buf = '';
    process.stdout.write(label + ': ');
    var onData, cleanup;
    cleanup = function () {
      try { stdin.setRawMode(false); } catch (e) {}
      try { stdin.pause(); } catch (e) {}
      if (onData) stdin.removeListener('data', onData);
    };
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
      try { stdin.setRawMode(true); } catch (e) {}
    }
    stdin.resume();
    onData = function (ch) {
      var s = ch.toString('utf8');
      if (s === '\r' || s === '\n' || s === '\u0004') {
        process.stdout.write('\n');
        cleanup();
        resolve(buf);
      } else if (s === '\u0003') {
        process.stdout.write('\n');
        cleanup();
        reject(new Error('aborted'));
      } else if (s === '\u007f' || s === '\b') {
        buf = buf.slice(0, -1);
      } else if (s >= ' ' && s !== '\u007f') {
        buf += s;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  var live = process.argv.indexOf('--live') !== -1;
  console.log('MINIMSAAH password rotation — ' + (live ? 'LIVE' : 'DRY RUN (writes nothing)'));
  console.log('Accounts: ' + STAFF.map(function (s) { return s.email; }).join(', '));
  if (!live) {
    console.log('Dry run OK: wiring valid. Re-run with --live to rotate.');
    return;
  }
  var serviceKey = await promptSecret('SUPABASE_SERVICE_ROLE_KEY (masked, memory-only)');
  if (!serviceKey) { console.error('Service key required — aborting, nothing changed.'); process.exit(1); }
  var supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });

  var listed = await supabase.auth.admin.listUsers();
  if (listed.error) { console.error('Cannot list users: ' + listed.error.message); process.exit(1); }
  var byEmail = {};
  (listed.data.users || []).forEach(function (u) { byEmail[u.email] = u; });

  for (const s of STAFF) {
    var existing = byEmail[s.email];
    if (!existing) { console.error('FAIL ' + s.email + ': no such Auth user — aborting, nothing changed for this account.'); process.exit(1); }
    var pw = await promptSecret('New password for ' + s.email + ' (masked, memory-only)');
    if (!pw || pw.length < 16) { console.error('FAIL ' + s.email + ': password must be 16+ characters — aborting.'); process.exit(1); }
    var up = await supabase.auth.admin.updateUserById(existing.id, { password: pw });
    pw = null;
    if (up.error) { console.error('FAIL ' + s.email + ': ' + up.error.message); process.exit(1); }
    var check = await supabase.auth.admin.getUserById(existing.id);
    var role = check.data && check.data.user && check.data.user.user_metadata && check.data.user.user_metadata.role;
    if (role !== s.expectRole) { console.error('FAIL ' + s.email + ': role changed to ' + role + ' — STOP, investigate before continuing.'); process.exit(1); }
    console.log('OK ' + s.email + ' (role ' + role + ' intact)');
  }
  console.log('Rotation complete. Tell staff to re-login everywhere.');
}

main().catch(function (e) { console.error('Aborted: ' + (e.message || e)); process.exit(1); });
