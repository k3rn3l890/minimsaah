/**
 * Vercel serverless route: POST /api/admin/delete { table, id }
 * Sole live delete door (host is Vercel). Retired the Cloudflare twin
 * (functions/api/admin/delete.js) in Phase 3 — one door, no twins.
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Verifies caller JWT role OWNER/EDITOR via Supabase Auth, then deletes
 * via service_role. Fixed words only. Dormant while admin deletes stay
 * locked in beta (admin.js supaDelete throws before calling).
 */
import { createClient } from '@supabase/supabase-js';

// Delete caps (code only, memory only): max 10 per hour AND max 50 per
// day per user. Resets when server sleeps. Slows abuse, no hard server bill.
const deleteTimesByUser = new Map();
function deleteAllowed(userId) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const list = (deleteTimesByUser.get(userId) || []).filter((t) => (now - t) < day);
  const lastHour = list.filter((t) => (now - t) < hour);
  if (lastHour.length >= 10) {
    const oldest = lastHour[0] || now;
    return { ok: false, retrySec: Math.ceil((oldest + hour - now) / 1000) };
  }
  if (list.length >= 50) {
    const oldest = list[0] || now;
    return { ok: false, retrySec: Math.ceil((oldest + day - now) / 1000) };
  }
  list.push(now);
  deleteTimesByUser.set(userId, list);
  return { ok: true, retrySec: 0 };
}

const allowed = ['articles', 'videos', 'documentaries', 'events', 'tickers', 'sponsors', 'contact_messages', 'media'];

function readBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);
  } catch (e) {}
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const env = process.env;
  const headers = req.headers || {};
  const auth = String(headers['authorization'] || headers['Authorization'] || '');
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server not configured' });
    return;
  }
  const supaUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: uErr } = await supaUser.auth.getUser();
  if (uErr || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  const role = user.user_metadata && user.user_metadata.role;
  if (!['OWNER', 'EDITOR'].includes(role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const bodyData = readBody(req);
  const table = bodyData.table;
  const id = bodyData.id;
  if (!allowed.includes(table) || typeof id !== 'string' || id.length < 1 || id.length > 128 || !/^[A-Za-z0-9._-]+$/.test(id)) {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const cap = deleteAllowed(user.id);
  if (!cap.ok) {
    if (res.setHeader) res.setHeader('Retry-After', String(cap.retrySec || 60));
    res.status(429).json({ error: 'Too many deletes. Wait a bit.' });
    return;
  }
  const supaAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  if (table === 'media') {
    const { error: sErr } = await supaAdmin.storage.from('minimsaah-media').remove([id]);
    // Fixed words only — raw database words never leave the server.
    if (sErr) {
      res.status(400).json({ error: 'Delete failed' });
      return;
    }
  }
  const { error } = await supaAdmin.from(table).delete().eq('id', id);
  // Fixed words only — raw database words never leave the server.
  if (error) {
    res.status(400).json({ error: 'Delete failed' });
    return;
  }
  res.status(200).json({ ok: true });
}
