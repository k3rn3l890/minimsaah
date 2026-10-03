/**
 * Cloudflare Pages Function — admin delete proxy (hides service_role)
 * POST /api/admin/delete { table, id }
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Verifies caller JWT role OWNER/EDITOR via Supabase Auth, then deletes via service_role.
 */
import { createClient } from '@supabase/supabase-js';

// Soft delete cap (code only, memory only): max 10 deletes per hour per user.
// Resets when server sleeps. Soft way: slows abuse, does not hard block pros.
const deleteTimesByUser = new Map();
function deleteAllowed(userId) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const list = (deleteTimesByUser.get(userId) || []).filter((t) => (now - t) < hour);
  if (list.length >= 10) {
    const oldest = list[0] || now;
    const retrySec = Math.ceil((oldest + hour - now) / 1000);
    return { ok: false, retrySec };
  }
  list.push(now);
  deleteTimesByUser.set(userId, list);
  return { ok: true, retrySec: 0 };
}

export async function onRequestPost(context) {
  return handleDelete(context.request, context.env);
}

// Vercel format (same logic, so it works on Vercel too)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const result = await handleDelete(req, process.env);
  const body = await result.json().catch(() => ({ error: 'error' }));
  const retryAfter = result.headers ? result.headers.get('Retry-After') : null;
  if (retryAfter && res.setHeader) res.setHeader('Retry-After', retryAfter);
  res.status(result.status).json(body);
}

async function handleDelete(request, env) {
  const auth = request.headers.get ? request.headers.get('Authorization') || '' : (request.headers['authorization'] || request.headers['Authorization'] || '');
  if (!auth.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Server not configured' }, { status: 500 });
  }

  const supaUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: uErr } = await supaUser.auth.getUser();
  if (uErr || !user) return Response.json({ error: 'Invalid token' }, { status: 401 });

  const role = user.user_metadata?.role;
  if (!['OWNER', 'EDITOR'].includes(role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const bodyData = (typeof request.json === 'function')
    ? await request.json().catch(() => ({}))
    : (request.body || {});
  const table = bodyData.table;
  const id = bodyData.id;
  const allowed = ['articles', 'videos', 'documentaries', 'events', 'tickers', 'media'];
  if (!allowed.includes(table) || typeof id !== 'string' || id.length < 1 || id.length > 128 || !/^[A-Za-z0-9._-]+$/.test(id)) return Response.json({ error: 'Bad request' }, { status: 400 });

  const cap = deleteAllowed(user.id);
  if (!cap.ok) {
    return Response.json({ error: 'Too many deletes. Wait a bit.' }, { status: 429, headers: { 'Retry-After': String(cap.retrySec || 60) } });
  }

  const supaAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (table === 'media') {
    // also remove storage object if filename matches id? caller passes filename as id for media
    const { error: sErr } = await supaAdmin.storage.from('minimsaah-media').remove([id]);
    if (sErr) return Response.json({ error: sErr.message }, { status: 400 });
  }

  const { error } = await supaAdmin.from(table).delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
