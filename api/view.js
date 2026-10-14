/**
 * Vercel serverless route: POST /api/view { table, id }
 * Public view-count door. Replaces direct anon calls to the increment_view
 * RPC (revoked in supabase/rls.sql) so counts cannot be spammed by skilled
 * callers replaying the RPC. Same hardening shape as api/log-event.js:
 * allow-list, id shape guard, per-minute global cap + per-address cap,
 * fixed words only. Counting never blocks content — failures are silent.
 */
import { createClient } from '@supabase/supabase-js';

const ALLOWED_TABLES = ['articles', 'videos', 'documentaries'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const viewTimes = [];
const viewTimesByIp = new Map();

function viewAllowed(ip) {
  const now = Date.now();
  const minute = 60 * 1000;
  while (viewTimes.length && now - viewTimes[0] >= minute) viewTimes.shift();
  if (viewTimes.length >= 300) return { ok: false, retrySec: 60 };
  const list = (viewTimesByIp.get(ip) || []).filter((t) => now - t < minute);
  if (list.length >= 30) {
    const oldest = list[0] || now;
    return { ok: false, retrySec: Math.ceil((oldest + minute - now) / 1000) };
  }
  viewTimes.push(now);
  list.push(now);
  viewTimesByIp.set(ip, list);
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

function readBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);
  } catch (e) {}
  return {};
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
  const body = readBody(req);
  const table = typeof body.table === 'string' ? body.table : '';
  const id = typeof body.id === 'string' ? body.id : '';
  if (!ALLOWED_TABLES.includes(table) || !ID_RE.test(id)) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const ip = callerIp(req);
  const cap = viewAllowed(ip || 'unknown');
  if (!cap.ok) {
    if (res.setHeader) res.setHeader('Retry-After', String(cap.retrySec || 60));
    res.status(429).json({ error: 'Slow down.' });
    return;
  }
  const supaAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await supaAdmin.rpc('increment_view', { table_name: table, row_id: id });
  // Fixed words only — raw database words never leave the server.
  if (error) {
    res.status(400).json({ error: 'Count failed' });
    return;
  }
  res.status(200).json({ ok: true });
}
