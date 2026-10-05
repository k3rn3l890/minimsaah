/**
 * MINIMSAAH — admin.js
 * Vanilla admin helpers: auth, api wrapper, guards, utils
 */
(function (global) {
  var API = 'http://localhost:3000/api/v1';
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    // Render backend is gone (Supabase sole backend) — no dead default.
    // request() throws an explicit error below when Supabase is not configured.
    API = (window.__API_BASE__ || '');
  }

  function getToken() { return localStorage.getItem('access_token'); }
  function getRefresh() { return localStorage.getItem('refresh_token'); }
  function setTokens(at, rt) {
    if (at) localStorage.setItem('access_token', at);
    if (rt) localStorage.setItem('refresh_token', rt);
  }
  function clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }
  function setUser(u) { localStorage.setItem('user', JSON.stringify(u)); }

  function authHeaders() {
    var t = getToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }

  async function request(path, opts) {
    if (!useSupabase() && !API) {
      throw new Error('Supabase not configured — set Vercel env SUPABASE_URL / SUPABASE_ANON_KEY and redeploy');
    }
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders(), opts.headers || {});
    // FormData: drop JSON header
    if (opts.body instanceof FormData) delete headers['Content-Type'];
    var res = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401 && getRefresh()) {
      // try refresh once
      try {
        var r = await fetch(API + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: getRefresh() }) });
        if (r.ok) {
          var data = await r.json();
          setTokens(data.accessToken, data.refreshToken);
          // retry
          headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders(), opts.headers || {});
          if (opts.body instanceof FormData) delete headers['Content-Type'];
          res = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
        }
      } catch {}
    }
    var text = await res.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if (!res.ok) {
      var msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
      if (Array.isArray(msg)) msg = msg.join(', ');
      throw new Error(msg);
    }
    return json;
  }

  function useSupabase() {
    return window.SupabaseDB && window.SupabaseDB.isEnabled();
  }

  function supa() {
    return window.SupabaseDB ? window.SupabaseDB.client() : null;
  }

  var STAFF_ROLES = ['OWNER', 'EDITOR', 'JOURNALIST', 'VIDEOGRAPHER'];
  function isStaffRole(r) { return STAFF_ROLES.indexOf(r) !== -1; }
  function isLocalhost() { return location.hostname === 'localhost' || location.hostname === '127.0.0.1'; }

  async function requireAuth(opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || 8000;
    function fail() { location.href = '/admin/login.html'; throw new Error('Not authenticated'); }
    function withTimeout(p) {
      return Promise.race([
        p,
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('auth timeout')); }, timeoutMs); }),
      ]);
    }
    if (useSupabase()) {
      var sb = supa();
      if (!sb) fail();
      var session = null;
      try {
        var res = await withTimeout(sb.auth.getSession());
        session = res.data && res.data.session;
      } catch (e) { fail(); }
      if (!session) fail();
      // Staff gate: role comes from the verified auth user, never localStorage.
      var role = null;
      try {
        var ures = await withTimeout(sb.auth.getUser());
        var u = ures.data && ures.data.user;
        role = u && u.user_metadata && u.user_metadata.role;
      } catch (e) { fail(); }
      if (!isStaffRole(role)) {
        try { await sb.auth.signOut(); } catch (e) {}
        clearTokens();
        fail();
      }
      // MFA enforcement: only when the account has verified factors
      // (nextLevel==='aal2'). Factor-less staff are provably unaffected.
      try {
        if (sb.auth.mfa && typeof sb.auth.mfa.getAuthenticatorAssuranceLevel === 'function') {
          var aal = await withTimeout(sb.auth.mfa.getAuthenticatorAssuranceLevel());
          var lv = (aal.data || {});
          if (lv.nextLevel === 'aal2' && lv.currentLevel !== 'aal2') {
            try { await sb.auth.signOut(); } catch (e) {}
            clearTokens();
            fail();
          }
        }
      } catch (e) { fail(); }
      startIdleWatch();
      return session;
    }
    // Supabase not configured: localhost Nest fallback only. Prod fails closed.
    if (!isLocalhost()) fail();
    if (!getToken()) fail();
    startIdleWatch();
    return null;
  }

  async function logout() {
    stopIdleWatch();
    if (useSupabase()) {
      try { await supa().auth.signOut(); } catch {}
    }
    var rt = getRefresh();
    if (rt) fetch(API + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }).catch(function(){});
    clearTokens();
    location.href = '/admin/login.html';
  }

  // Idle auto-logout: warn at 10 min idle, log out at 15 min idle.
  // Starts only after a staff login passes requireAuth (never on login page).
  // Any mouse, key, touch or scroll resets the clock. Stay extends it.
  var IDLE_WARN_MS = 10 * 60 * 1000;
  var IDLE_OUT_MS = 15 * 60 * 1000;
  var idleLast = 0, idleTickTimer = null, idleCountTimer = null, idleWarned = false, idleOn = false;

  function idleBump() {
    if (!idleOn) return;
    var now = Date.now();
    if (now - idleLast < 1000) return;
    idleLast = now;
    if (idleWarned) hideIdleWarn();
  }

  function fmtIdleLeft(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function showIdleWarn() {
    idleWarned = true;
    var ov = document.getElementById('idle-warn');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'idle-warn';
      ov.setAttribute('role', 'alertdialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', 'Idle warning');
      ov.style.cssText = 'position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);padding:16px;';
      ov.innerHTML =
        '<div style="background:#0A0A0A;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:24px;max-width:360px;width:100%;text-align:center;">' +
        '<p style="color:#fff;font-size:15px;margin:0 0 6px;">You have been idle.</p>' +
        '<p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">Logging out in <span id="idle-count" style="color:#E63946;font-weight:bold;">5:00</span></p>' +
        '<div style="display:flex;gap:8px;margin-top:16px;">' +
        '<button id="idle-stay" style="flex:1;background:#E63946;color:#fff;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;padding:12px;border-radius:4px;border:0;cursor:pointer;min-height:44px;">Stay Logged In</button>' +
        '<button id="idle-out" style="flex:1;background:transparent;color:#9ca3af;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;padding:12px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;min-height:44px;">Log Out Now</button>' +
        '</div></div>';
      document.body.appendChild(ov);
      document.getElementById('idle-stay').addEventListener('click', function () { idleBump(); });
      document.getElementById('idle-out').addEventListener('click', function () { logout(); });
      ov.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') logout();
      });
    }
    ov.style.display = 'flex';
    try { document.getElementById('idle-stay').focus(); } catch (e) {}
    if (idleCountTimer) clearInterval(idleCountTimer);
    idleCountTimer = setInterval(function () {
      var left = IDLE_OUT_MS - (Date.now() - idleLast);
      var el = document.getElementById('idle-count');
      if (el) el.textContent = fmtIdleLeft(left);
      if (left <= 0) logout();
    }, 1000);
  }

  function hideIdleWarn() {
    idleWarned = false;
    if (idleCountTimer) { clearInterval(idleCountTimer); idleCountTimer = null; }
    var ov = document.getElementById('idle-warn');
    if (ov) ov.style.display = 'none';
  }

  function stopIdleWatch() {
    idleOn = false;
    if (idleTickTimer) { clearInterval(idleTickTimer); idleTickTimer = null; }
    if (idleCountTimer) { clearInterval(idleCountTimer); idleCountTimer = null; }
  }

  function startIdleWatch() {
    if (idleOn) return;
    idleOn = true;
    idleLast = Date.now();
    idleWarned = false;
    var events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(function (ev) {
      window.addEventListener(ev, idleBump, { passive: true });
    });
    if (idleTickTimer) clearInterval(idleTickTimer);
    idleTickTimer = setInterval(function () {
      if (!idleOn) return;
      var idleFor = Date.now() - idleLast;
      if (idleFor >= IDLE_OUT_MS) { logout(); return; }
      if (idleFor >= IDLE_WARN_MS && !idleWarned) showIdleWarn();
    }, 15000);
  }

  function deletesDisabled() {
    // Beta lock: service_role out entirely, deletes disabled with exact message
    return useSupabase();
  }

  async function supaDelete(table, id) {
    // Beta: deletes disabled — buttons stay visible per plan, show exact message
    if (deletesDisabled()) {
      toast('Disabled in beta');
      throw new Error('Disabled in beta');
    }
    // Post-beta path via Pages Functions proxy hiding service_role (kept for return)
    var sb = supa();
    var session = sb ? (await sb.auth.getSession()).data.session : null;
    var res = await fetch('/api/admin/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (session ? session.access_token : getToken()) },
      body: JSON.stringify({ table: table, id: id }),
    });
    if (!res.ok) {
      var j = await res.json().catch(function(){ return { error: res.statusText }; });
      throw new Error(j.error || ('HTTP ' + res.status));
    }
    return res.json();
  }

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function cuid() {
    // CSPRNG ids (DB keys are TEXT; UUIDs satisfy the RPC row_id shape).
    // Falls back to the legacy timestamp scheme outside secure contexts.
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var b = new Uint8Array(16);
        window.crypto.getRandomValues(b);
        b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
        var h = []; for (var i = 0; i < 16; i++) h.push(('0' + b[i].toString(16)).slice(-2));
        var s = h.join('');
        return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
      }
    } catch (e) {}
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Map camelCase form payloads to Supabase snake_case columns (same fix as auth-migrate first_name).
  function toSnake(payload) {
    var map = { coverImage: 'cover_image', videoUrl: 'video_url', embedUrl: 'embed_url', publishedAt: 'published_at', readingTime: 'reading_time', authorId: 'author_id', viewCount: 'view_count', ticketUrl: 'ticket_url', endDate: 'end_date', createdAt: 'created_at', updatedAt: 'updated_at', originalName: 'original_name', mimeType: 'mime_type', uploaderId: 'uploader_id', firstName: 'first_name', lastName: 'last_name', avatarUrl: 'avatar_url' };
    var o = {};
    for (var k in payload) {
      if (payload[k] === undefined) continue;
      o[map[k] || k] = payload[k];
    }
    return o;
  }

  // Load one row by id for edit forms. Returns normalized row.
  async function supaOne(table, id) {
    var sb = supa();
    if (!sb) throw new Error('Supabase not configured — set Vercel env SUPABASE_URL / SUPABASE_ANON_KEY and redeploy');
    var r = await sb.from(table).select('*').eq('id', id).single();
    if (r.error) throw new Error(r.error.message);
    return normRow(r.data);
  }

  // Create/update with Nest parity: slug fallback, author from session, readingTime calc.
  async function supaSave(table, id, isEdit, payload) {
    var sb = supa();
    if (!sb) throw new Error('Supabase not configured — set Vercel env SUPABASE_URL / SUPABASE_ANON_KEY and redeploy');
    var body = toSnake(payload);
    if (!body.slug && body.title) body.slug = slugify(body.title);
    if (isEdit) {
      var up = await sb.from(table).update(body).eq('id', id);
      if (up.error) throw new Error(up.error.message);
      return up.data;
    }
    if (table === 'articles' || table === 'videos' || table === 'documentaries' || table === 'events') {
      var me = getUser() || {};
      var sess = (await sb.auth.getSession()).data.session;
      body.author_id = (sess && sess.user && sess.user.id) || me.id || body.author_id;
    }
    body.id = cuid();
    if (table === 'articles' && body.body && !body.reading_time) {
      body.reading_time = Math.ceil(String(body.body).split(' ').length / 200);
    }
    var ins = await sb.from(table).insert(body);
    if (ins.error) throw new Error(ins.error.message);
    return ins.data;
  }

  // Upload a File to Supabase Storage + insert media row. Returns {url, filename} like Nest.
  // opts.imagesOnly (covers/thumbnails): rejects non-images before anything
  // leaves the browser. Double gate (MIME + extension) since either alone is
  // spoofable; SVG excluded (public bucket + XML scriptability = stored XSS).
  var IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
  var IMAGE_MAX_BYTES = 8 * 1024 * 1024;
  // Media-library gate (NOT imagesOnly): images + video + documents stay
  // allowed, but active content is denied even when MIME is spoofed.
  var LIBRARY_VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v', '.ogg'];
  var LIBRARY_DOC_EXTS = ['.pdf', '.doc', '.docx'];
  var LIBRARY_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
  var BLOCKED_EXTS = ['.svg', '.html', '.htm', '.js', '.mjs', '.php', '.exe', '.sh', '.bat', '.cmd', '.ps1'];
  function checkLibraryFile(file) {
    var mime = file.type || '';
    var ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    if (BLOCKED_EXTS.indexOf(ext) !== -1) throw new Error('File type not allowed');
    var isImg = mime.indexOf('image/') === 0 && IMAGE_EXTS.indexOf(ext) !== -1;
    var isVid = mime.indexOf('video/') === 0 && LIBRARY_VIDEO_EXTS.indexOf(ext) !== -1;
    var isDoc = LIBRARY_DOC_EXTS.indexOf(ext) !== -1 && (mime === '' || mime.indexOf('application/') === 0 || mime.indexOf('text/') === 0);
    if (!isImg && !isVid && !isDoc) throw new Error('Only images, videos and documents (PDF/DOC) are allowed');
    var cap = isVid ? LIBRARY_VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size > cap) throw new Error('File too large (max ' + (isVid ? '50 MB' : '8 MB') + ')');
  }
  async function supaUpload(file, meta, opts) {
    var sb = supa();
    if (!sb) throw new Error('Supabase not configured — set Vercel env SUPABASE_URL / SUPABASE_ANON_KEY and redeploy');
    if (!file) throw new Error('No file selected');
    // Max 5 uploads per 10 minutes per browser. Stops batch spam.
    if (!budget('upload', 5, 10 * 60 * 1000)) throw new Error('Slow down. Too many uploads — wait a bit.');
    if (opts && opts.imagesOnly) {
      var mime = file.type || '';
      var imgExt = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
      if (mime.indexOf('image/') !== 0 || IMAGE_EXTS.indexOf(imgExt) === -1) {
        throw new Error('Only image files are allowed (JPG, PNG, GIF, WebP, AVIF)');
      }
      if (file.size > IMAGE_MAX_BYTES) throw new Error('Image too large (max 8 MB)');
    }
    if (opts && opts.library) checkLibraryFile(file);
    var ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0];
    var filename = cuid() + ext;
    var up = await sb.storage.from('minimsaah-media').upload(filename, file, { contentType: file.type, upsert: false });
    if (up.error) throw new Error(up.error.message);
    var url = sb.storage.from('minimsaah-media').getPublicUrl(filename).data.publicUrl;
    var type = file.type.indexOf('image/') === 0 ? 'IMAGE' : (file.type.indexOf('video/') === 0 ? 'VIDEO' : 'DOCUMENT');
    var me = getUser() || {};
    var sess = (await sb.auth.getSession()).data.session;
    var uid = (sess && sess.user && sess.user.id) || me.id || null;
    var ins = await sb.from('media').insert({ id: cuid(), filename: filename, original_name: file.name, mime_type: (file.type || 'application/octet-stream'), size: file.size, url: url, alt: (meta && meta.alt) || null, caption: (meta && meta.caption) || null, type: type, uploader_id: uid });
    if (ins.error) throw new Error(ins.error.message);
    return { url: url, filename: filename };
  }

  // Map Supabase snake_case rows to the camelCase fields templates use.
  // Keeps both key styles so Nest and Supabase payloads render identically.
  function normRow(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    var o = {};
    for (var k in r) {
      o[k] = r[k];
      var ck = k.replace(/_([a-z])/g, function (m, c) { return c.toUpperCase(); });
      if (ck !== k && o[ck] === undefined) o[ck] = r[k];
    }
    return o;
  }

  // Supabase list with pager parity to the Nest API.
  // opts: {status, active, search, searchFields, category, orderBy, asc, secondaryOrderBy, page, limit, noPager}
  // returns {items (normalized), meta:{total,page,limit,totalPages}}
  async function supaList(table, opts) {
    opts = opts || {};
    // Soft guards (code only): table allow list + page caps + search slow-down.
    var allowedTables = ['articles', 'videos', 'documentaries', 'events', 'tickers', 'sponsors', 'site_settings', 'media', 'users'];
    if (allowedTables.indexOf(table) === -1) throw new Error('Bad table');
    var page = opts.page || 1, limit = opts.limit || 10;
    if (!(page >= 1)) page = 1;
    if (!(limit >= 1)) limit = 10;
    if (limit > 50) limit = 50;
    // Max 30 searches per minute per page (soft, browser memory only).
    if (opts.search) {
      var nowS = Date.now();
      global.__msSearchTimes = global.__msSearchTimes || [];
      global.__msSearchTimes = global.__msSearchTimes.filter(function (t) { return (nowS - t) < 60 * 1000; });
      if (global.__msSearchTimes.length >= 30) {
        try {
          var logSb = supa();
          if (logSb) logSb.rpc('log_admin_event', { p_event: 'limit_hit', p_email: '', p_success: false, p_detail: ('search cap ' + table).slice(0, 100) });
        } catch (e) {}
        throw new Error('Slow down. Wait a bit and try search again.');
      }
      global.__msSearchTimes.push(nowS);
    }
    var sb = supa();
    if (!sb) throw new Error('Supabase not configured — set Vercel env SUPABASE_URL / SUPABASE_ANON_KEY and redeploy');
    var q = sb.from(table).select('*', { count: 'exact' });
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.active !== undefined) q = q.eq('active', opts.active);
    if (opts.category) q = q.eq('category', opts.category);
    if (opts.search) {
      var clean = String(opts.search).slice(0, 100).replace(/[%_(),<>"']/g, '');
      var fields = opts.searchFields || ['title'];
      q = q.or(fields.map(function (f) { return f + '.ilike.%' + clean + '%'; }).join(','));
    }
    q = q.order(opts.orderBy || 'created_at', { ascending: !!opts.asc });
    if (opts.secondaryOrderBy) q = q.order(opts.secondaryOrderBy, { ascending: !!opts.asc });
    if (!opts.noPager) q = q.range((page - 1) * limit, page * limit - 1);
    else if (limit) q = q.limit(limit);
    var r = await q;
    if (r.error) throw new Error(r.error.message);
    var items = (r.data || []).map(normRow);
    var total = (r.count !== null && r.count !== undefined) ? r.count : items.length;
    return { items: items, meta: { total: total, page: page, limit: limit, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
  }

  function toast(msg, type) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;min-width:240px;max-width:360px;padding:12px 16px;border-radius:6px;font-size:13px;border:1px solid rgba(255,255,255,0.1);display:none;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = type === 'error' ? '#7f1d1d' : '#0A0A0A';
    el.style.borderColor = type === 'error' ? '#E63946' : 'rgba(255,255,255,0.1)';
    el.style.color = '#fff';
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 3000);
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
    });
  }

  // Shared input checker. Block-hard: returns {ok:true,value} or
  // {ok:false,message}. Call per box on submit; first bad box stops save.
  // opts: {label, max, min, allowEmpty, noCode, slug, email, urlHttps,
  //        digits, intRange:[lo,hi], oneOf:[...]}
  function cleanField(value, opts) {
    opts = opts || {};
    var label = opts.label || 'This field';
    var v = (value === null || value === undefined) ? '' : String(value);
    v = v.replace(/^\s+|\s+$/g, '');
    if (v === '') {
      if (opts.allowEmpty) return { ok: true, value: '' };
      return { ok: false, message: label + ' is needed.' };
    }
    if (opts.max && v.length > opts.max) return { ok: false, message: label + ' must be ' + opts.max + ' letters or less.' };
    if (opts.min && v.length < opts.min) return { ok: false, message: label + ' must be at least ' + opts.min + ' letters.' };
    if (opts.noCode && /[<>"']/.test(v)) return { ok: false, message: label + ' cannot hold < > " or \'.' };
    if (opts.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) return { ok: false, message: label + ' must be small letters, numbers and dash only.' };
    if (opts.email) {
      v = v.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, message: label + ' must look like name@site.' };
    }
    if (opts.urlHttps && !/^https:\/\//i.test(v)) return { ok: false, message: label + ' must start with https://.' };
    if (opts.digits && !/^\d+$/.test(v)) return { ok: false, message: label + ' must be digits only.' };
    if (opts.intRange) {
      var n = parseInt(v, 10);
      if (isNaN(n) || n < opts.intRange[0] || n > opts.intRange[1]) return { ok: false, message: label + ' must be a whole number from ' + opts.intRange[0] + ' to ' + opts.intRange[1] + '.' };
      v = String(n);
    }
    if (opts.oneOf && opts.oneOf.indexOf(v) === -1) return { ok: false, message: label + ' has a bad choice.' };
    return { ok: true, value: v };
  }

  // Search-box cleaner for public and admin lists. Caps length and strips
  // database wildcard + code signs. Returns safe string (may be empty).
  function cleanSearch(q, max) {
    var v = (q === null || q === undefined) ? '' : String(q);
    v = v.replace(/^\s+|\s+$/g, '').slice(0, max || 100);
    return v.replace(/[%_(),<>"']/g, '');
  }

  // Browser-memory budget: max N actions per windowMs per key.
  // Returns true if allowed (and counts it), false if over budget.
  function budget(key, max, windowMs) {
    try {
      var now = Date.now();
      var k = 'ms_budget_' + key;
      var list = [];
      try { list = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { list = []; }
      list = list.filter(function (t) { return (now - t) < windowMs; });
      if (list.length >= max) return false;
      list.push(now);
      localStorage.setItem(k, JSON.stringify(list));
      return true;
    } catch (e) { return true; }
  }

  // Sidebar active — works under cleanUrls (/admin, /admin/videos, /admin/videos.html)
  function setActiveNav() {
    var seg = location.pathname.split('/').pop() || '';
    var path = seg || 'index.html';
    if (path === 'admin') path = 'index.html';
    else if (path.indexOf('.') === -1) path = path + '.html';
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === path) a.classList.add('bg-white/5', 'text-white');
    });
  }

  global.Admin = {
    API: API,
    request: request,
    getToken: getToken,
    getUser: getUser,
    setUser: setUser,
    setTokens: setTokens,
    clearTokens: clearTokens,
    requireAuth: requireAuth,
    isStaffRole: isStaffRole,
    STAFF_ROLES: STAFF_ROLES,
    escapeHtml: escapeHtml,
    cleanField: cleanField,
    cleanSearch: cleanSearch,
    budget: budget,
    logout: logout,
    slugify: slugify,
    fmtDate: fmtDate,
    toast: toast,
    setActiveNav: setActiveNav,
    useSupabase: useSupabase,
    supa: supa,
    supaDelete: supaDelete,
    deletesDisabled: deletesDisabled,
    normRow: normRow,
    supaList: supaList,
    toSnake: toSnake,
    supaOne: supaOne,
    supaSave: supaSave,
    supaUpload: supaUpload,
  };
})(window);
