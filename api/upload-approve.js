/**
 * Vercel serverless route: POST /api/upload-approve { filename, mime, size, kind }
 * Upload gate: verifies the caller is staff (JWT + DB profile, same trust as
 * the delete door), re-checks type/size against the SAME caps as
 * admin/js/admin.js, and audit-logs the attempt with staff identity.
 * Returns { ok: true } — the browser must call this before Storage upload.
 *
 * Enforcement model (honest): this door cannot physically stop a direct
 * Storage call (uploads are client-to-Storage by design on this plan).
 * It raises the bar three ways: (1) the UI flow cannot skip approval,
 * (2) every attempt is audit-logged with who/what, (3) the media-row RLS
 * binds uploader_id to auth.uid(), so forged rows fail at the database.
 * A full service_role upload proxy is the follow-up if abuse appears
 * (note: Vercel's 4.5 MB body cap rules out proxying 50 MB videos today).
 */
import { createClient } from '@supabase/supabase-js';

// Caps mirror admin/js/admin.js EXACTLY (drift is a test failure):
// IMAGE_EXTS, IMAGE_MAX_BYTES, LIBRARY_VIDEO_EXTS, LIBRARY_DOC_EXTS,
// LIBRARY_VIDEO_MAX_BYTES, BLOCKED_EXTS.
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const LIBRARY_VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v', '.ogg'];
const LIBRARY_DOC_EXTS = ['.pdf', '.doc', '.docx'];
const LIBRARY_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const BLOCKED_EXTS = ['.svg', '.html', '.htm', '.js', '.mjs', '.php', '.exe', '.sh', '.bat', '.cmd', '.ps1'];

const approveTimesByUser = new Map();
function approveAllowed(userId) {
  const now = Date.now();
  const minute = 60 * 1000;
  const list = (approveTimesByUser.get(userId) || []).filter((t) => now - t < minute);
  if (list.length >= 10) {
    const oldest = list[0] || now;
    return { ok: false, retrySec: Math.ceil((oldest + minute - now) / 1000) };
  }
  list.push(now);
  approveTimesByUser.set(userId, list);
  return { ok: true, retrySec: 0 };
}

function readBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);
  } catch (e) {}
  return {};
}

function extOf(name) {
  const m = String(name || '').match(/\.[a-z0-9]+$/i);
  return (m ? m[0] : '').toLowerCase();
}

// Returns '' when allowed, else the fixed-word reason.
function checkFile(kind, filename, mime, size) {
  const ext = extOf(filename);
  if (!filename || filename.length > 200) return 'Bad request';
  if (typeof size !== 'number' || !(size > 0)) return 'Bad request';
  if (BLOCKED_EXTS.indexOf(ext) !== -1) return 'File type not allowed';
  if (kind === 'image') {
    if (mime.indexOf('image/') !== 0 || IMAGE_EXTS.indexOf(ext) === -1) {
      return 'Only image files are allowed (JPG, PNG, GIF, WebP, AVIF)';
    }
    if (size > IMAGE_MAX_BYTES) return 'Image too large (max 8 MB)';
    return '';
  }
  if (kind === 'library') {
    const isImg = mime.indexOf('image/') === 0 && IMAGE_EXTS.indexOf(ext) !== -1;
    const isVid = mime.indexOf('video/') === 0 && LIBRARY_VIDEO_EXTS.indexOf(ext) !== -1;
    const isDoc = LIBRARY_DOC_EXTS.indexOf(ext) !== -1
      && (mime === '' || mime.indexOf('application/') === 0 || mime.indexOf('text/') === 0);
    if (!isImg && !isVid && !isDoc) return 'Only images, videos and documents (PDF/DOC) are allowed';
    const cap = isVid ? LIBRARY_VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (size > cap) return isVid ? 'File too large (max 50 MB)' : 'File too large (max 8 MB)';
    return '';
  }
  return 'Bad request';
}

export { checkFile, extOf, IMAGE_MAX_BYTES, LIBRARY_VIDEO_MAX_BYTES };

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
  const supaAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: { user }, error: uErr } = await supaUser.auth.getUser();
  if (uErr || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  // JWT metadata is the fast path; the DB profile is truth (catches stale
  // tokens after a role change / suspend). Uploads allow all staff roles.
  let role = user.user_metadata && user.user_metadata.role;
  let active = true;
  try {
    const { data: profile } = await supaAdmin
      .from('users')
      .select('role,status')
      .eq('id', user.id)
      .single();
    if (profile) {
      if (profile.role) role = profile.role;
      if (profile.status && profile.status !== 'ACTIVE') active = false;
    }
  } catch (e) {}
  async function audit(outcome, detail) {
    try {
      await supaAdmin.from('admin_audit').insert({
        event: outcome === 'approved' ? 'upload_approved' : 'upload_rejected',
        email: user.email || null,
        success: outcome === 'approved',
        detail: String(detail).slice(0, 500),
      });
    } catch (e) {}
  }
  if (!['OWNER', 'EDITOR', 'JOURNALIST', 'VIDEOGRAPHER'].includes(role) || !active) {
    await audit('rejected', 'upload:unauthorized');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const body = readBody(req);
  const kind = body.kind === 'library' ? 'library' : body.kind === 'image' ? 'image' : '';
  const filename = typeof body.filename === 'string' ? body.filename : '';
  const mime = typeof body.mime === 'string' ? body.mime : '';
  const size = typeof body.size === 'number' ? body.size : NaN;
  const reason = checkFile(kind, filename, mime, size);
  if (reason) {
    await audit('rejected', `upload:${kind || 'unknown'}:${extOf(filename) || 'noext'}`);
    res.status(400).json({ error: reason });
    return;
  }
  const cap = approveAllowed(user.id);
  if (!cap.ok) {
    if (res.setHeader) res.setHeader('Retry-After', String(cap.retrySec || 60));
    await audit('rejected', 'upload:rate-limited');
    res.status(429).json({ error: 'Too many uploads. Wait a bit.' });
    return;
  }
  await audit('approved', `upload:${kind}:${extOf(filename)}:${size}`);
  res.status(200).json({ ok: true });
}
