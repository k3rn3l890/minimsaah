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
      return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return d; }
  }

  function show(el, on) { el.classList.toggle('hidden', !on); }

  function useSupabase() {
    return global.SupabaseDB && global.SupabaseDB.isEnabled();
  }

  function apiBase() {
    try {
      var host = (global.location && global.location.hostname) || '';
      if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api/v1';
    } catch (e) {}
    return (global.__API_BASE__ || '');
  }

  // Slug-or-id to URL piece. '' means caller skips the row.
  function safeSlug(it) {
    try { return encodeURIComponent(String((it && (it.slug || it.id)) || '')); }
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
    var res = await fetch(apiBase() + '/' + opts.table + '/' + encodeURIComponent(slug));
    if (!res.ok) throw new Error('not found');
    return normRow(await res.json());
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
      document.getElementById(btnId || 'share-copy').onclick = function () {
        navigator.clipboard.writeText(location.href);
        this.textContent = '✓';
        setTimeout(() => this.innerHTML = '<iconify-icon icon="solar:link-linear" width="14"></iconify-icon>', 1200);
      };
    } catch (e) {}
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
    try {
      var base = apiBase();
      if (!base) return fail();
      var res = await fetch(base + '/' + table + '?status=PUBLISHED&limit=' + (limit || 100));
      if (!res.ok) return fail();
      var data = await res.json();
      return (data.items || data || []).map(normRow);
    } catch (e) { return fail(); }
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
