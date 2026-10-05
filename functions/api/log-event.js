/**
 * Audit log door — stamps the caller address (IP) that browser code
 * can never know or be trusted with.
 * POST /api/log-event { event, email, success, detail }
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * No login needed (failed logins have no session). Event allow-list,
 * field caps, per-minute global cap + per-address cap. Fixed words only.
 */
import { createClient } from '@supabase/supabase-js';

const ALLOWED_EVENTS = [
  'login_failed',
  'login_denied',
  'guard_denied',
  'upload_rejected',
  'delete_blocked',
  'limit_hit',
  'input_blocked',
];

// Memory caps: 60 total per minute (mirrors the DB writer) + 10 per
// minute per address. Resets when server sleeps.
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

// Caller address from server headers only — never from the posted body.
function callerIp(request, env) {
  try {
    var headers = request.headers;
    var get = null;
    if (headers && typeof headers.get === 'function') {
      get = function (n) { return headers.get(n) || headers.get(n.toLowerCase()) || ''; };
    } else if (headers) {
      get = function (n) {
        return headers[n] || headers[n.toLowerCase()] || headers[n.toUpperCase()] || '';
      };
    }
    var fwd = get ? String(get('x-forwarded-for') || '') : '';
    if (fwd) {
      var first = fwd.split(',')[0].trim();
      if (first) return first.slice(0, 45);
    }
    var cf = get ? String(get('cf-connecting-ip') || '') : '';
    if (cf) return cf.trim().slice(0, 45);
    if (request.socket && request.socket.remoteAddress) {
      return String(request.socket.remoteAddress).slice(0, 45);
    }
    if (env && env.CLIENT_IP) return String(env.CLIENT_IP).slice(0, 45);
  } catch (e) {}
  return '';
}

async function handleLog(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Server not configured' }, { status: 500 });
  }
  var body = {};
  try {
    body = (typeof request.json === 'function' ? await request.json().catch(() => ({})) : request.body) || {};
  } catch (e) {
    body = {};
  }
  var event = typeof body.event === 'string' ? body.event : '';
  var email = typeof body.email === 'string' ? body.email : '';
  var detail = typeof body.detail === 'string' ? body.detail : '';
  var success = body.success === true;
  if (!ALLOWED_EVENTS.includes(event)) return Response.json({ error: 'Bad request' }, { status: 400 });
  if (email.length > 320 || detail.length > 500) {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  var ip = callerIp(request, env);
  var cap = logAllowed(ip || 'unknown');
  if (!cap.ok) {
    return Response.json(
      { error: 'Slow down.' },
      { status: 429, headers: { 'Retry-After': String(cap.retrySec || 60) } }
    );
  }
  var supaAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  var { error } = await supaAdmin.from('admin_audit').insert({
    event: event,
    email: email === '' ? null : email,
    success: success,
    detail: detail === '' ? null : detail,
    ip: ip === '' ? null : ip,
  });
  // Fixed words only — raw database words never leave the server.
  if (error) return Response.json({ error: 'Log failed' }, { status: 400 });
  return Response.json({ ok: true });
}

export async function onRequestPost(context) {
  return handleLog(context.request, context.env);
}

// Vercel format (same logic, so it works on Vercel too)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const result = await handleLog(req, process.env);
  const body = await result.json().catch(() => ({ error: 'error' }));
  const retryAfter = result.headers ? result.headers.get('Retry-After') : null;
  if (retryAfter && res.setHeader) res.setHeader('Retry-After', retryAfter);
  res.status(result.status).json(body);
}
