/**
 * Vercel serverless route: POST /api/log-event
 * Same logic as functions/api/log-event.js (Cloudflare Pages twin).
 * If you change one, change the other. Vercel serves this file live.
 *
 * Stamps the caller address (IP) that browser code can never know.
 * No login needed. Event allow-list, field caps, per-minute global cap
 * + per-address cap. Fixed words only.
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
  const email = typeof body.email === 'string' ? body.email : '';
  const detail = typeof body.detail === 'string' ? body.detail : '';
  const success = body.success === true;
  if (!ALLOWED_EVENTS.includes(event)) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  if (email.length > 320 || detail.length > 500) {
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
  const { error } = await supaAdmin.from('admin_audit').insert({
    event: event,
    email: email === '' ? null : email,
    success: success,
    detail: detail === '' ? null : detail,
    ip: ip === '' ? null : ip,
  });
  // Fixed words only — raw database words never leave the server.
  if (error) {
    res.status(400).json({ error: 'Log failed' });
    return;
  }
  res.status(200).json({ ok: true });
}
