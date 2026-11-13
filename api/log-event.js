/**
 * Vercel serverless route: POST /api/log-event
 * Sole live audit door (host is Vercel; Cloudflare twin retired Phase 3).
 *
 * Stamps the caller address (IP) that browser code can never know.
 * Optional Bearer token: when a session token rides along it is verified
 * and the row is bound to that real account (source 'verified'); without
 * one the row is visitor telemetry (source 'client'). login_success is
 * accepted ONLY with a verified token. Event allow-list, field caps,
 * per-minute global cap + per-address cap. Fixed words only.
 */
import { createClient } from '@supabase/supabase-js';
import { auditIdentity } from './lib/auditIdentity.js';

const ALLOWED_EVENTS = [
  'login_failed',
  'login_denied',
  'guard_denied',
  'upload_rejected',
  'delete_blocked',
  'limit_hit',
  'input_blocked',
  'site_error',
  // Verified-token-only: records real sign-ins (email bound to the JWT).
  'login_success',
];

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

const stampTimes = [];
const stampTimesByIp = new Map();

function logAllowed(ip) {
  const now = Date.now();
  const minute = 60 * 1000;
  while (stampTimes.length && now - stampTimes[0] >= minute) stampTimes.shift();
  if (stampTimes.length >= 60) return { ok: false, retrySec: 60 };
  const list = (stampTimesByIp.get(ip) || []).filter((t) => now - t < minute);
  if (list.length >= 10) {
    const oldest = list[0] || now;
    return { ok: false, retrySec: Math.ceil((oldest + minute - now) / 1000) };
  }
  stampTimes.push(now);
  list.push(now);
  stampTimesByIp.set(ip, list);
  return { ok: true, retrySec: 0 };
}

function callerIp(req) {
  try {
    const h = req.headers || {};
    const fwd = String(h['x-forwarded-for'] || h['X-Forwarded-For'] || '');
    if (fwd) {
      const first = fwd.split(',')[0].trim();
      if (first) return first.slice(0, 45);
    }
    if (req.socket && req.socket.remoteAddress) {
      return String(req.socket.remoteAddress).slice(0, 45);
    }
  } catch (e) {}
  return '';
}

export default async function handler(req, res) {
  if (res.setHeader) res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server not configured' });
    return;
  }
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) || {};
  const event = typeof body.event === 'string' ? body.event : '';
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 320) : '';
  const detail = typeof body.detail === 'string' ? body.detail.trim().slice(0, 500) : '';
  const success = body.success === true;
  if (!ALLOWED_EVENTS.includes(event)) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  // Identity first, before any rate budget is consumed. A presented
  // Bearer token is verified against Supabase Auth; when it is valid the
  // row is bound to that account (the posted email is ignored), so a
  // caller can never sign somebody else's name. login_success - real
  // sign-ins only - is refused without a verified token.
  let verifiedUser = null;
  const auth = String((req.headers || {})['authorization']
    || (req.headers || {})['Authorization'] || '');
  if (auth.startsWith('Bearer ') && env.SUPABASE_ANON_KEY) {
    try {
      const supaUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data: ud, error: uErr } = await supaUser.auth.getUser();
      if (!uErr && ud && ud.user) verifiedUser = ud.user;
    } catch (e) {}
  }
  const identity = auditIdentity(event, verifiedUser, email);
  if (!identity.ok) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  // Shape checks police only what the caller posted: a verified email
  // comes from the auth server and is trusted as-is.
  if (identity.source === 'client' && email !== '' && !EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  // Reject control characters that break dashboard review / log parsing.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test((identity.email || '') + detail)) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const ip = callerIp(req);
  const cap = logAllowed(ip || 'unknown');
  if (!cap.ok) {
    if (res.setHeader) res.setHeader('Retry-After', String(cap.retrySec || 60));
    res.status(429).json({ error: 'Slow down.' });
    return;
  }
  const supaAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  // Durable cross-instance throttle: memory caps reset on cold start, so
  // re-check the last minute in the DB before inserting. Fail open on
  // read errors (availability) — memory cap still slows floods.
  try {
    const since = new Date(Date.now() - 60 * 1000).toISOString();
    const { count } = await supaAdmin
      .from('admin_audit')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);
    if (typeof count === 'number' && count >= 60) {
      if (res.setHeader) res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'Slow down.' });
      return;
    }
  } catch (e) {}
  const { error } = await supaAdmin.from('admin_audit').insert({
    event: event,
    email: identity.email,
    success: success,
    detail: detail === '' ? null : detail,
    ip: ip === '' ? null : ip,
    actor_id: identity.actorId,
    source: identity.source,
  });
  // Fixed words only — raw database words never leave the server.
  if (error) {
    res.status(400).json({ error: 'Log failed' });
    return;
  }
  res.status(200).json({ ok: true });
}
