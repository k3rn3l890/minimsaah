/**
 * MINIMSAAH — lib.js (Phase 4)
 * ONE home for the helpers pasted across every public page: esc, normRow,
 * fmtDate, show, useSupabase, apiBase, safeSlug, durLabel, cleanQuery,
 * sortFeaturedFirst, thumbFor, readingTimeLabel, fetchPublished.
 * Pure functions only — zero DOM access at load, safe on every page.
 * Pages call window.MinimsaahLib.* instead of redefining their own copies.
 * Behaviour matches the originals exactly (verified by tests/smoke.mjs).
 */
(function (global) {
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Map Supabase snake_case rows to the camelCase fields templates use.
  // Keeps both key styles so every existing read (a.coverImage, …) works.
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

  function fmtDate(d) {
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return d; }
  }

  function show(el, on) {
    try {
      if (!el || !el.classList || typeof el.classList.toggle !== 'function') return;
      el.classList.toggle('hidden', !on);
    } catch (e) {}
  }

  function useSupabase() {
    return global.SupabaseDB && global.SupabaseDB.isEnabled();
  }

  function apiBase() {
    // Supabase is the sole backend. No localhost/Render fallback:
    // '' means Supabase-direct only — callers must not fetch a dead API.
    return (global.__API_BASE__ || '');
  }

  // Slug-or-id to URL piece. '' means caller skips the row. Capped at 200
  // to match the sitemap safeSlug gate.
  function safeSlug(it) {
    try {
      var s = String((it && (it.slug || it.id)) || '');
      if (!s || s.length > 200) return '';
      return encodeURIComponent(s);
    }
    catch (e) { return ''; }
  }

  // Seconds (or row with .duration) to m:ss. '' when unknown.
  function durLabel(v) {
    var n = Number(v && typeof v === 'object' ? v.duration : v);
    if (!isFinite(n) || n <= 0) return '';
    return Math.floor(n / 60) + ':' + String(Math.floor(n) % 60).padStart(2, '0');
  }

  // Search-box cleaner shared by public and admin lists: trim, lower,
  // cap 100, strip database-wildcard + code signs.
  function cleanQuery(q) {
    return String(q == null ? '' : q).trim().toLowerCase().slice(0, 100).replace(/[%_(),<>"']/g, '');
  }

  // Featured rows first, then newest date, empty dates last.
  function sortFeaturedFirst(items) {
    return (items || []).slice().sort(function (a, b) {
      var fa = !!(a && a.featured), fb = !!(b && b.featured);
      if (fa !== fb) return fa ? -1 : 1;
      var ta = a && (a.publishedAt || a.createdAt) ? Date.parse(a.publishedAt || a.createdAt) : NaN;
      var tb = b && (b.publishedAt || b.createdAt) ? Date.parse(b.publishedAt || b.createdAt) : NaN;
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    });
  }

  function thumbFor(v) {
    try {
      if (global.MinimsaahEmbeds) return global.MinimsaahEmbeds.thumbnailUrl(v);
    } catch (e) {}
    return (v && (v.thumbnail || v.coverImage)) || '';
  }

  function readingTimeLabel(n) { return (n || 5) + ' min read'; }

  function getSlug() {
    try { return new URLSearchParams(global.location.search).get('slug'); }
    catch (e) { return null; }
  }

  // One published row by slug, normalized. Throws Error('not found') on
  // missing slug, query miss, or dead fallback — callers show error UI.
  // opts: {table, select, withAuthor, view} where view names the
  // increment_view table (absent when the table has no view counter).
  async function loadOne(opts) {
    var slug = getSlug();
    if (!slug) throw new Error('not found');
    var sb = apiClient();
    if (sb) {
      var r = await sb.from(opts.table).select(opts.select || '*')
        .eq('slug', slug).eq('status', 'PUBLISHED').single();
      if (r.error) throw new Error('not found');
      var row = normRow(r.data);
      if (opts.withAuthor && row.author) row.author = normRow(row.author);
      if (opts.view) {
        try {
          if (global.SupabaseDB && global.SupabaseDB.throttledRpc) {
            await global.SupabaseDB.throttledRpc(
              'increment_view', { table_name: opts.view, row_id: row.id },
              'view_' + opts.view + '_' + row.id);
          }
        } catch (e) {}
      }
      return row;
    }
    // No legacy API fallback: Supabase-direct only. Without a client the
    // row cannot be resolved — throw so callers show their error state.
    throw new Error('not found');
  }

  // Detail-page states: 'content' reveals, anything else shows the error.
  function setPageState(which) {
    try {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById(which === 'content' ? 'content' : 'error').classList.remove('hidden');
    } catch (e) {}
  }

  function renderTags(tags) {
    try {
      var tg = document.getElementById('tags');
      (tags || []).forEach(function (t) {
        var s = document.createElement('span');
        s.className = 'text-[10px] font-mono tracking-widest border border-white/10 px-2 py-1 text-gray-500 uppercase';
        s.textContent = '#' + t;
        tg.appendChild(s);
      });
    } catch (e) {}
  }

  function bindShareCopy(btnId) {
    try {
      var btn = document.getElementById(btnId || 'share-copy');
      if (!btn || typeof btn.addEventListener !== 'function') return false;
      var original = btn.innerHTML;
      btn.addEventListener('click', function () {
        function done(ok) {
          try {
            if (ok) {
              btn.textContent = '✓';
              setTimeout(function () { btn.innerHTML = original; }, 1200);
            }
          } catch (e) {}
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(location.href).then(
              function () { done(true); },
              function () { done(false); }
            );
          } else {
            done(false);
          }
        } catch (e) { done(false); }
      });
      return true;
    } catch (e) { return false; }
  }

  // Play-overlay chunk shared by the video list renders. The in-site
  // variant is a real <button> with a spoken label (keyboard + readers
  // reach it); the go-out variant stays a plain marker because the whole
  // card is already the link. Static markup, zero user data unescaped.
  function overlayHTML(o) {
    o = o || {};
    if (o.goOut) {
      return '<div class="absolute inset-0 flex items-center justify-center"><div class="rounded-full w-14 h-14 bg-[#E63946]/90 flex items-center justify-center"><svg class="w-6 h-6 text-white ml-1 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span class="sr-only">Watch on provider</span></div></div>';
    }
    if (!o.videoUrl) return '';
    return '<div class="absolute inset-0 flex items-center justify-center"><button type="button" aria-label="Play ' + esc(o.title || 'this video') + '" class="rounded-full w-14 h-14 bg-[#E63946]/90 flex items-center justify-center cursor-pointer" data-video-url="' + esc(o.videoUrl) + '"' + (o.embedUrl ? ' data-embed-url="' + esc(o.embedUrl) + '"' : '') + '><svg class="w-6 h-6 text-white ml-1 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button></div>';
  }

  // Spoken label for home-page play buttons (their titles arrive later).
  function labelPlay(el, title) {
    try {
      if (el) el.setAttribute('aria-label', 'Play ' + String(title || 'this video').slice(0, 100));
    } catch (e) {}
  }

  // Mobile drawer wiring shared by all detail/list pages (toggle, drawer,
  // close ids default to the detail variant). Uses the full aria-expanded
  // variant everywhere — three pages missed those updates before.
  // Esc closes, focus returns to the toggle, backdrop click closes.
  function wireDrawer(toggleId, drawerId, closeId) {
    try {
      var t = document.getElementById(toggleId || 'menu-toggle-detail');
      var d = document.getElementById(drawerId || 'mobile-drawer-detail');
      var c = document.getElementById(closeId || 'menu-close-detail');
      if (!t || !d) return false;
      function open() {
        d.classList.remove('hidden');
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () { d.classList.remove('opacity-0'); });
        } else {
          d.classList.remove('opacity-0');
        }
        t.setAttribute('aria-expanded', 'true');
        try { document.body.style.overflow = 'hidden'; } catch (e) {}
        try { if (c && c.focus) c.focus(); } catch (e) {}
      }
      function close(restoreFocus) {
        d.classList.add('opacity-0');
        setTimeout(function () { d.classList.add('hidden'); }, 200);
        t.setAttribute('aria-expanded', 'false');
        try { document.body.style.overflow = ''; } catch (e) {}
        if (restoreFocus !== false) {
          try { if (t && t.focus) t.focus(); } catch (e) {}
        }
      }
      function onKey(e) {
        try {
          if (e && e.key === 'Escape' && !d.classList.contains('hidden')) close();
        } catch (err) {}
      }
      if (t.addEventListener) t.addEventListener('click', open);
      else t.onclick = open;
      if (c) {
        if (c.addEventListener) c.addEventListener('click', function () { close(); });
        else c.onclick = close;
      }
      if (d.addEventListener) {
        d.addEventListener('click', function (e) { if (e.target === d) close(false); });
      } else {
        d.onclick = function (e) { if (e.target === d) close(false); };
      }
      if (document.addEventListener) document.addEventListener('keydown', onKey);
      return true;
    } catch (e) { return false; }
  }

  function apiClient() {
    if (useSupabase()) {
      try {
        var sb = global.SupabaseDB.client();
        if (sb) return sb;
      } catch (e) {}
    }
    return null;
  }

  // Published rows for a listing page, normalized. [] on any failure —
  // callers show their empty/error state, never throw — unless opts.strict,
  // which throws Error('not found') on failure (empty data still returns []).
  // Supabase-direct only: no legacy REST fallback (Render retired).
  async function fetchPublished(table, orderField, limit, opts) {
    var strict = !!(opts && opts.strict);
    var fail = function () { if (strict) throw new Error('not found'); return []; };
    var sb = apiClient();
    if (sb) {
      try {
        var r = await sb.from(table).select('*').eq('status', 'PUBLISHED')
          .order(orderField || 'published_at', { ascending: false }).limit(limit || 100);
        if (r.error) throw new Error(r.error.message);
        return (r.data || []).map(normRow);
      } catch (e) { return fail(); }
    }
    // No Supabase client and no legacy API: fail closed, no dead fetch.
    return fail();
  }

  global.MinimsaahLib = {
    esc: esc,
    normRow: normRow,
    fmtDate: fmtDate,
    show: show,
    useSupabase: useSupabase,
    apiBase: apiBase,
    safeSlug: safeSlug,
    durLabel: durLabel,
    cleanQuery: cleanQuery,
    sortFeaturedFirst: sortFeaturedFirst,
    thumbFor: thumbFor,
    readingTimeLabel: readingTimeLabel,
    fetchPublished: fetchPublished,
    getSlug: getSlug,
    loadOne: loadOne,
    setPageState: setPageState,
    renderTags: renderTags,
    bindShareCopy: bindShareCopy,
    overlayHTML: overlayHTML,
    labelPlay: labelPlay,
    wireDrawer: wireDrawer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
