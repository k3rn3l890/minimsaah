/**
 * MINIMSAAH — admin.js
 * Vanilla admin helpers: auth, api wrapper, guards, utils
 */
(function (global) {
  var API = 'http://localhost:3000/api/v1';
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    API = (window.__API_BASE__ || 'http://localhost:3000/api/v1');
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

  function requireAuth() {
    if (!getToken()) {
      location.href = 'login.html';
      throw new Error('Not authenticated');
    }
  }

  function logout() {
    var rt = getRefresh();
    if (rt) fetch(API + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }).catch(function(){});
    clearTokens();
    location.href = 'login.html';
  }

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

  // Sidebar active
  function setActiveNav() {
    var path = location.pathname.split('/').pop() || 'index.html';
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
    logout: logout,
    slugify: slugify,
    fmtDate: fmtDate,
    toast: toast,
    setActiveNav: setActiveNav,
  };
})(window);
