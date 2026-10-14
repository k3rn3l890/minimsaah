/**
 * MINIMSAAH — app.js
 * Hydrates minimsaah_v1/index.html with live data from Supabase direct.
 * Supabase is the sole backend (Render retired). No legacy REST fallback.
 * When Supabase is not configured, hydrators show their empty state.
 */
(function () {
  var API = (window.__API_BASE__ || '');

  function useSupabase() {
    return window.SupabaseDB && window.SupabaseDB.isEnabled();
  }

  // Map Supabase snake_case rows to the camelCase fields templates use.
  // Same pattern as admin.js normRow: keeps both key styles so every
  // existing read (a.coverImage, v.viewCount, …) works unchanged.
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

  async function fetchSupabase(table, opts) {
    opts = opts || {};
    try {
      var sb = window.SupabaseDB.client();
      if (!sb) return null;
      var q = sb.from(table).select(opts.select || '*');
      if (opts.status) q = q.eq('status', opts.status);
      if (opts.active !== undefined) q = q.eq('active', opts.active);
      if (opts.category) q = q.eq('category', opts.category);
      if (opts.orderBy) q = q.order(opts.orderBy, { ascending: false });
      else if (table !== 'tickers') q = q.order('published_at', { ascending: false });
      else q = q.order('priority', { ascending: false });
      if (opts.limit) q = q.limit(opts.limit);
      var res = await q;
      if (res.error) throw new Error(res.error.message);
      var items = (res.data || []).map(normRow);
      return { items: items, meta: { total: items.length, page: 1, limit: opts.limit || 10, totalPages: 1 } };
    } catch (e) {
      console.warn('[MINIMSAAH] supabase fetch failed', table, e.message);
      return null;
    }
  }

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  async function fetchJSON(path) {
    // Legacy REST door retired: fail closed when no explicit API base is
    // configured. Never fetch a same-origin guess (would 404 + waste).
    if (!API) return null;
    try {
      var res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('[MINIMSAAH] fetch failed', path, e.message);
      return null;
    }
  }

  function fmtDate(d) {
    try {
      var date = new Date(d);
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return d; }
  }

  function readingTimeLabel(n) { return (n || 5) + ' min read'; }

  // Featured rows first, then newest date, empty dates last.
  // Home only takes 3, so we fetch extra and slice after sorting —
  // a featured item is never stuck in 4th place off-screen.
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

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); });
  }

  function thumbForVideo(v) {
    if (window.MinimsaahEmbeds) return window.MinimsaahEmbeds.thumbnailUrl(v);
    return v.thumbnail || v.coverImage || '';
  }

  // ─── Live zones: shimmer until truth, never demo ────────────────
  // Each dynamic home section is wrapped at runtime: a shimmer veil covers
  // it while live data loads, then content fades in. On failure a small
  // note + Try Again shows instead of stale demo. Text stays in the HTML
  // for crawlers and no-JS readers (see noscript rule); eyes never see it.
  var ZONE_TIMEOUT = 8000;
  var zoneRetry = {};
  var titlesReady = null;
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error('zone timeout')); }, ms || ZONE_TIMEOUT);
    })]);
  }
  function armZone(id, retryFn) {
    var sec = document.getElementById(id);
    if (!sec) return null;
    if (retryFn) zoneRetry[id] = retryFn;
    if (sec.getAttribute('data-live-armed')) return sec;
    sec.setAttribute('data-live-armed', '1');
    sec.setAttribute('data-live-zone', '');
    var wrap = document.createElement('div');
    wrap.className = 'live-content';
    while (sec.firstChild) wrap.appendChild(sec.firstChild);
    sec.appendChild(wrap);
    var veil = document.createElement('div');
    veil.className = 'live-veil';
    veil.setAttribute('aria-hidden', 'true');
    sec.appendChild(veil);
    var err = document.createElement('div');
    err.className = 'live-err';
    var msg = document.createElement('p');
    msg.className = 'text-sm text-gray-400';
    msg.textContent = 'Could not load this section.';
    err.appendChild(msg);
    var btn = document.createElement('button');
    btn.textContent = 'Try Again';
    btn.className = 'bg-[#E63946] hover:bg-[#c53030] text-white text-xs font-mono tracking-widest uppercase px-5 py-3 min-h-[44px] rounded-sm transition-colors touch-manipulation';
    btn.addEventListener('click', function () {
      var fn = zoneRetry[id];
      if (fn) fn();
    });
    err.appendChild(btn);
    sec.appendChild(err);
    sec.setAttribute('data-live', 'waiting');
    return sec;
  }
  function zoneReady(id) {
    var sec = document.getElementById(id);
    if (!sec) return;
    sec.setAttribute('data-live', 'ready');
    try { if (window.ScrollTrigger) setTimeout(function () { window.ScrollTrigger.refresh(); }, 80); } catch (e) {}
  }
  // Reveal only after section titles have settled, so headings never swap visibly.
  function titlesThenReady(id) {
    try {
      Promise.resolve(titlesReady).then(function () { zoneReady(id); });
    } catch (e) { zoneReady(id); }
  }
  function zoneFail(id) {
    var sec = document.getElementById(id);
    if (!sec) return;
    sec.setAttribute('data-live', 'failed');
    try { if (window.ScrollTrigger) setTimeout(function () { window.ScrollTrigger.refresh(); }, 80); } catch (e) {}
  }
  // Swap an image without a pop: new photo fades in only when loaded.
  function setLiveImg(img, src, alt) {
    if (!img || !src) return;
    try {
      img.classList.add('live-img', 'is-loading');
      if (alt) img.alt = alt;
      var done = function () { try { img.classList.remove('is-loading'); } catch (e) {} };
      img.onload = done;
      img.onerror = done;
      if (img.getAttribute('src') !== src) img.src = src;
      else done();
    } catch (e) {}
  }

  // ─── Hydrate Hero (featured article) ─────────────────────────────
  async function hydrateHero() {
    if (!armZone('hero', hydrateHero)) return;
    try {
      var data = await withTimeout(useSupabase()
        ? fetchSupabase('articles', { status: 'PUBLISHED', limit: 2, orderBy: 'published_at' })
        : fetchJSON('/articles?status=PUBLISHED&limit=2'));
      if (!data || !data.items || !data.items.length) throw new Error('empty');
      var a = data.items[0];
    var heroTitle = qs('#hero-title');
    var heroDeck = qs('#hero-deck');
    var heroBadge = qs('#hero-badge');
    var heroMeta = qs('#hero-meta');
    var heroCta = qs('#hero-cta');
    var heroImg = qs('#hero-img');

    if (heroTitle) {
      heroTitle.textContent = a.title;
      heroTitle.style.cursor = 'pointer';
      heroTitle.addEventListener('click', function () { location.href = '/article.html?slug=' + encodeURIComponent(a.slug); });
    }
    if (heroDeck && a.excerpt) heroDeck.textContent = a.excerpt;
    if (heroBadge) {
      // update badge text to category
      var cat = heroBadge.querySelector('span');
      if (cat) cat.textContent = (a.category || 'Exclusive').toUpperCase();
      // update time
      var time = heroBadge.querySelectorAll('span')[1];
      if (time && a.publishedAt) time.textContent = fmtDate(a.publishedAt);
    }
    if (heroMeta) {
      heroMeta.innerHTML = '<span class="text-xs font-mono text-gray-400">By <span class="text-white">' + escapeHtml((a.author && (a.author.firstName + ' ' + a.author.lastName)) || 'MINIMSAAH') + '</span></span><span class="w-1 h-1 rounded-full bg-[#E63946]"></span><span class="text-xs font-mono text-gray-500">' + escapeHtml(readingTimeLabel(a.readingTime)) + '</span>';
    }
    if (heroCta) heroCta.href = '/article.html?slug=' + encodeURIComponent(a.slug);
    if (heroImg && a.coverImage) setLiveImg(heroImg, a.coverImage, a.title);
    // Secondary story (same hydrate pattern as side cards). Honest empty
    // state: hide the block when there is no second story instead of
    // leaving a placeholder that links nowhere.
    var sec = qs('#hero-secondary a.group\\/secgroup');
    var second = data.items[1];
    if (sec && second) {
      var secImg = sec.querySelector('img');
      if (secImg && second.coverImage) setLiveImg(secImg, second.coverImage, second.title);
      var secCat = sec.querySelector('span');
      if (secCat) secCat.textContent = (second.category || 'Feature').replace(/_/g, ' ').toUpperCase();
      var secTitle = sec.querySelector('h3');
      if (secTitle) secTitle.textContent = second.title;
      var secSpans = sec.querySelectorAll('span');
      var secMeta = secSpans[secSpans.length - 1];
      if (secMeta) secMeta.textContent = readingTimeLabel(second.readingTime);
      sec.href = '/article.html?slug=' + encodeURIComponent(second.slug);
    } else if (!second) {
      var secWrap = qs('#hero-secondary');
      if (secWrap) secWrap.style.display = 'none';
    }
    titlesThenReady('hero');
    // refresh ScrollTrigger if present
    if (window.ScrollTrigger) setTimeout(function () { window.ScrollTrigger.refresh(); }, 80);
    } catch (e) { zoneFail('hero'); }
  }

  // ─── Hydrate Featured Section ────────────────────────────────────
  async function hydrateFeatured() {
    if (!armZone('featured', hydrateFeatured)) return;
    try {
    var section = qs('#featured');
    if (!section) throw new Error('missing');
    var data = await withTimeout(useSupabase()
      ? fetchSupabase('articles', { status: 'PUBLISHED', limit: 4, orderBy: 'published_at' })
      : fetchJSON('/articles?status=PUBLISHED&limit=4'));
    if (!data || !data.items || data.items.length < 2) throw new Error('empty');
    var featured = data.items[0];
    var sides = data.items.slice(1, 4);

    var grid = section.querySelector('.grid');
    if (!grid) throw new Error('missing');

    // Large card (first col)
    var large = grid.children[0];
    if (large && featured) {
      var img = large.querySelector('img');
      if (img && featured.coverImage) setLiveImg(img, featured.coverImage, featured.title);
      var h3 = large.querySelector('h3');
      if (h3) { h3.textContent = featured.title; large.style.cursor = 'pointer'; }
      var p = large.querySelector('p.text-gray-400');
      if (p && featured.excerpt) p.textContent = featured.excerpt;
      large.onclick = function () { location.href = '/article.html?slug=' + encodeURIComponent(featured.slug); };
    }

    // Side cards
    var sideContainer = grid.children[1];
    if (sideContainer && sides.length) {
      var cards = qsa('a.group\\/card', sideContainer);
      sides.forEach(function (art, i) {
        var card = cards[i];
        if (!card) return;
        var img = card.querySelector('img');
        if (img && art.coverImage) setLiveImg(img, art.coverImage, art.title);
        var h4 = card.querySelector('h4');
        if (h4) h4.textContent = art.title;
        var cat = card.querySelector('span.text-\\[10px\\]');
        if (cat) cat.textContent = (art.category || '').replace(/_/g, ' ');
        var meta = card.querySelector('p.text-xs');
        if (meta) meta.textContent = readingTimeLabel(art.readingTime) + ' • ' + fmtDate(art.publishedAt);
        card.href = '/article.html?slug=' + encodeURIComponent(art.slug);
      });
    }
    titlesThenReady('featured');
    } catch (e) { zoneFail('featured'); }
  }

  // ─── Hydrate Video Stories (Docs-style grid) ────────────────────
  async function hydrateVideos() {
    if (!armZone('videos', hydrateVideos)) return;
    try {
    var section = qs('#videos');
    if (!section) throw new Error('missing');
    var data = await withTimeout(useSupabase()
      ? fetchSupabase('videos', { status: 'PUBLISHED', limit: 20, orderBy: 'published_at' })
      : fetchJSON('/videos?status=PUBLISHED&limit=20'));
    if (!data || !data.items || !data.items.length) throw new Error('empty');
    var videos = sortFeaturedFirst(data.items);
    var cards = qsa('#videos .grid > a', document);
    videos.slice(0, cards.length).forEach(function (v, idx) {
      try {
        var card = cards[idx];
        if (!card) return;
        var slug = null;
        try { slug = encodeURIComponent(String(v.slug || v.id || '')); } catch (e) { slug = ''; }
        if (!slug) return;
      var img = card.querySelector('img');
      if (img) {
        var t = thumbForVideo(v);
        if (t) setLiveImg(img, t, v.title);
      }
      var label = card.querySelector('span.text-\\[10px\\]');
      if (label) {
        var durTxt = '';
        if (v.duration) durTxt = ' • ' + Math.floor(v.duration / 60) + ':' + String(v.duration % 60).padStart(2, '0');
        label.textContent = ((v.category || 'Feature').replace(/_/g, ' ')) + durTxt;
      }
      var h3 = card.querySelector('h3');
      if (h3) h3.textContent = v.title;
      var p = card.querySelector('p');
      if (p && v.description) p.textContent = v.description;
      // Non-YouTube goes straight to the social video (new tab). YouTube stays in-site.
      var vprov = (window.MinimsaahEmbeds && window.MinimsaahEmbeds.detectProvider(v.videoUrl)) || 'unknown';
      var vout = (window.MinimsaahEmbeds && window.MinimsaahEmbeds.cleanVideoUrl(v.videoUrl)) || v.videoUrl || '';
      if (vprov !== 'youtube' && vprov !== 'unknown' && vout) {
        card.href = vout;
        card.setAttribute('target', '_blank');
        card.setAttribute('rel', 'noopener');
      } else {
        card.href = '/video.html?slug=' + slug;
        var play = card.querySelector('[data-play]');
        if (play && v.videoUrl) {
          play.setAttribute('data-video-url', v.videoUrl);
          try { play.setAttribute('aria-label', 'Play ' + String(v.title || 'this video').slice(0, 100)); } catch (e) {}
          if (v.embedUrl) play.setAttribute('data-embed-url', v.embedUrl);
          play.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.MinimsaahPlayer) window.MinimsaahPlayer.open({ videoUrl: v.videoUrl, embedUrl: v.embedUrl, title: v.title, thumbnail: thumbForVideo(v) });
          });
        }
      }
      } catch (cardErr) {
        try { console.warn('[home videos] skip bad row', v && (v.id || v.slug)); } catch (_) {}
      }
    });
    titlesThenReady('videos');
    } catch (e) { zoneFail('videos'); }
  }

  // ─── Hydrate Documentaries ──────────────────────────────────────
  async function hydrateDocs() {
    if (!armZone('docs', hydrateDocs)) return;
    try {
    var section = qs('#docs');
    if (!section) throw new Error('missing');
    var data = await withTimeout(useSupabase()
      ? fetchSupabase('documentaries', { status: 'PUBLISHED', limit: 20, orderBy: 'published_at' })
      : fetchJSON('/documentaries?status=PUBLISHED&limit=20'));
    if (!data || !data.items || !data.items.length) throw new Error('empty');
    var docs = sortFeaturedFirst(data.items);
    var cards = qsa('#docs .grid > a', document);
    docs.forEach(function (d, i) {
      var card = cards[i];
      if (!card) return;
      var img = card.querySelector('img');
      if (img) {
        var src = d.coverImage || d.thumbnail || thumbForVideo(d);
        if (src) setLiveImg(img, src, d.title);
      }
      var h3 = card.querySelector('h3');
      if (h3) h3.textContent = d.title;
      var meta = card.querySelector('span.text-\\[10px\\]');
      if (meta) meta.textContent = 'Documentary • ' + (d.duration ? Math.floor(d.duration/60) + ' min' : '');
      var p = card.querySelector('p');
      if (p && d.description) p.textContent = d.description;
      // Non-YouTube goes straight to the social video (new tab). YouTube stays in-site.
      var dprov = (window.MinimsaahEmbeds && window.MinimsaahEmbeds.detectProvider(d.videoUrl)) || 'unknown';
      var dout = (window.MinimsaahEmbeds && window.MinimsaahEmbeds.cleanVideoUrl(d.videoUrl)) || d.videoUrl || '';
      if (dprov !== 'youtube' && dprov !== 'unknown' && dout) {
        card.href = dout;
        card.setAttribute('target', '_blank');
        card.setAttribute('rel', 'noopener');
      } else {
        card.href = '/documentary.html?slug=' + encodeURIComponent(d.slug);
        // play overlay should open player modal, not navigate
        var playBtn = card.querySelector('.rounded-full');
        if (playBtn && d.videoUrl) {
          playBtn.setAttribute('data-video-url', d.videoUrl);
          try { playBtn.setAttribute('aria-label', 'Play ' + String(d.title || 'this documentary').slice(0, 100)); } catch (e) {}
          if (d.embedUrl) playBtn.setAttribute('data-embed-url', d.embedUrl);
          playBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); window.MinimsaahPlayer && window.MinimsaahPlayer.open({ videoUrl: d.videoUrl, embedUrl: d.embedUrl }); });
        }
      }
    });
    titlesThenReady('docs');
    } catch (e) { zoneFail('docs'); }
  }

  // ─── Hydrate News ───────────────────────────────────────────────
  async function hydrateNews() {
    if (!armZone('news', hydrateNews)) return;
    try {
    var section = qs('#news');
    if (!section) throw new Error('missing');
    var data = await withTimeout(useSupabase()
      ? fetchSupabase('articles', { status: 'PUBLISHED', limit: 6, orderBy: 'published_at' })
      : fetchJSON('/articles?status=PUBLISHED&limit=6'));
    if (!data || !data.items || !data.items.length) throw new Error('empty');
    var items = data.items;
    var cards = qsa('#news .grid > a', document);
    // first card spans 2 cols, rest singles
    items.slice(0, cards.length).forEach(function (art, i) {
      var card = cards[i];
      if (!card) return;
      var img = card.querySelector('img');
      if (img && art.coverImage) setLiveImg(img, art.coverImage, art.title);
      var h3 = card.querySelector('h3');
      if (h3) h3.textContent = art.title;
      var cat = card.querySelector('span.text-\\[10px\\]');
      if (cat) cat.textContent = (art.category || 'Feature').replace(/_/g, ' ');
      var meta = card.querySelector('span.text-xs, span.text-\\[10px\\].text-gray-500');
      // find meta span with "min read"
      var metas = card.querySelectorAll('span');
      metas.forEach(function (sp) {
        if (sp.textContent.indexOf('min read') !== -1) sp.textContent = readingTimeLabel(art.readingTime) + ' • ' + fmtDate(art.publishedAt);
      });
      card.href = '/article.html?slug=' + encodeURIComponent(art.slug);
    });
    titlesThenReady('news');
    } catch (e) { zoneFail('news'); }
  }

  // ─── Hydrate Events ─────────────────────────────────────────────
  async function hydrateEvents() {
    if (!armZone('events', hydrateEvents)) return;
    try {
    var section = qs('#events');
    if (!section) throw new Error('missing');
    var data = await withTimeout(useSupabase()
      ? fetchSupabase('events', { status: 'PUBLISHED', limit: 3, orderBy: 'date' })
      : fetchJSON('/events?status=PUBLISHED&limit=3'));
    if (!data || !data.items || !data.items.length) throw new Error('empty');
    var evs = data.items;
    var rows = qsa('#events .flex.flex-col > a', document);
    evs.forEach(function (ev, i) {
      var row = rows[i];
      if (!row) return;
      var day = row.querySelector('div.shrink-0 span');
      var mon = row.querySelector('span.text-\\[10px\\]');
      if (day) day.textContent = new Date(ev.date).getDate();
      if (mon) mon.textContent = new Date(ev.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      var h3 = row.querySelector('h3');
      if (h3) h3.textContent = ev.title;
      var p = row.querySelector('p.text-gray-500');
      if (p && ev.description) p.textContent = ev.description;
      var loc = row.querySelector('p.text-\\[10px\\].text-gray-600');
      if (loc) loc.textContent = (ev.location || ev.venue || '') + ' • ' + fmtDate(ev.date);
      row.href = '/event.html?slug=' + encodeURIComponent(ev.slug);
    });
    titlesThenReady('events');
    } catch (e) { zoneFail('events'); }
  }

  // ─── Hydrate Partners strip ───────────────────────────────────
  // Shown sponsors from DB (max 12). If DB is empty/offline, the static
  // fallback logos in the HTML keep showing — never an empty strip.
  function sponsorChip(v, hideFromReader) {
    var name = (v && v.name) || 'Partner';
    var logo = (v && (v.logoUrl || v.logo_url)) || '';
    var span = document.createElement('span');
    span.className = 'shrink-0 bg-white rounded-sm px-5 py-2.5 flex items-center';
    if (hideFromReader) span.setAttribute('aria-hidden', 'true');
    if (logo) {
      var img = document.createElement('img');
      img.src = logo;
      img.alt = hideFromReader ? '' : name;
      img.setAttribute('loading', 'lazy');
      img.className = 'h-7 w-auto';
      img.onerror = function () {
        span.textContent = hideFromReader ? '' : name;
        span.className += ' font-[Space_Grotesk,sans-serif] text-sm text-gray-800';
      };
      span.appendChild(img);
    } else {
      span.textContent = hideFromReader ? '' : name;
      span.className += ' font-[Space_Grotesk,sans-serif] text-sm text-gray-800';
    }
    return span;
  }

  async function hydrateSponsors() {
    var track = qs('#sponsor-track');
    if (!track || !useSupabase()) return;
    try {
      var sb = window.SupabaseDB.client();
      if (!sb) return;
      var r = await sb.from('sponsors').select('*').eq('active', true).order('priority', { ascending: false }).limit(12);
      if (r.error || !r.data || !r.data.length) return;
      var items = r.data.map(normRow).slice(0, 12);
      track.innerHTML = '';
      // 4 identical copies (2 twin halves) so the strip stays wider
      // than big screens — no black tail, endless loop, no jump.
      for (var copy = 0; copy < 4; copy++) {
        items.forEach(function (v) {
          try { track.appendChild(sponsorChip(v, copy > 0)); } catch (e) {}
        });
      }
    } catch (e) {
      console.warn('[MINIMSAAH] sponsors using static fallback');
    }
  }

  // ─── Hydrate section titles (boss-editable) ───────────────────
  // Reads site_settings once. Missing/odd values keep the fixed words.
  var TITLE_IDS = {
    section_featured: 'title-featured',
    section_videos: 'title-videos',
    section_docs: 'title-docs',
    section_news: 'title-news',
    section_events: 'title-events',
    section_partners: 'title-partners',
  };

  async function hydrateTitles() {
    if (!useSupabase()) return;
    try {
      var sb = window.SupabaseDB.client();
      if (!sb) return;
      var r = await sb.from('site_settings').select('key,value').limit(20);
      if (r.error || !r.data) return;
      r.data.forEach(function (row) {
        try {
          if (!row || typeof row.key !== 'string' || typeof row.value !== 'string') return;
          var id = TITLE_IDS[row.key];
          if (!id) return;
          var v = row.value.replace(/[<>"']/g, '').trim().replace(/\s+/g, ' ').slice(0, 40);
          if (!v) return;
          var el = document.getElementById(id);
          if (el) el.textContent = v;
        } catch (e) {}
      });
    } catch (e) {
      console.warn('[MINIMSAAH] titles using fixed words');
    }
  }

  // ─── Fix nav hrefs (remove localhost) ───────────────────────────
  function fixNav() {
    var map = {
      'http://localhost:3001/about': '#about',
      'http://localhost:3001/videos': '#videos',
      'http://localhost:3001/articles': '#news',
      'http://localhost:3001/documentaries': '#docs',
      'http://localhost:3001/events': '#events',
    };
    qsa('a[href^="http://localhost:3001"]').forEach(function (a) {
      var h = a.getAttribute('href');
      if (map[h]) a.setAttribute('href', map[h]);
      // drawer links also
      if (h && h.indexOf('/videos') !== -1) a.addEventListener('click', function (e) { e.preventDefault(); document.querySelector('#videos') && document.querySelector('#videos').scrollIntoView({ behavior: 'smooth' }); });
    });
  }

  // ─── Init ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    fixNav();
    // Titles settle first so section reveals never swap headings visibly.
    try { titlesReady = hydrateTitles(); } catch (e) { titlesReady = null; }
    hydrateHero();
    hydrateFeatured();
    hydrateVideos();
    hydrateDocs();
    hydrateNews();
    hydrateEvents();
    hydrateSponsors();

    // Expose for manual refresh
    window.MinimsaahHydrate = {
      titles: hydrateTitles,
      hero: hydrateHero,
      featured: hydrateFeatured,
      videos: hydrateVideos,
      docs: hydrateDocs,
      news: hydrateNews,
      events: hydrateEvents,
      sponsors: hydrateSponsors,
    };
  });
})();
