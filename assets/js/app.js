/**
 * MINIMSAAH — app.js
 * Hydrates minimsaah_v1/index.html with live data from backend at http://localhost:3000/api/v1
 * Keeps your design exactly same, only fills titles/images/links.
 * No redirect for videos: uses MinimsaahPlayer modal.
 */
(function () {
  var API = (function () {
    // Use backend on 3000; if served from backend itself, use relative
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api/v1';
    return (window.__API_BASE__ || 'http://localhost:3000/api/v1');
  })();

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  async function fetchJSON(path) {
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

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); });
  }

  function thumbForVideo(v) {
    if (window.MinimsaahEmbeds) return window.MinimsaahEmbeds.thumbnailUrl(v);
    return v.thumbnail || v.coverImage || '';
  }

  // ─── Hydrate Hero (featured article) ─────────────────────────────
  async function hydrateHero() {
    var data = await fetchJSON('/articles?status=PUBLISHED&limit=1');
    if (!data || !data.items || !data.items.length) return;
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
      heroTitle.addEventListener('click', function () { location.href = 'article.html?slug=' + encodeURIComponent(a.slug); });
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
      heroMeta.innerHTML = '<span class="text-xs font-mono text-gray-400">By <span class="text-white">' + escapeHtml((a.author && (a.author.firstName + ' ' + a.author.lastName)) || 'MINIMSAAH') + '</span></span><span class="w-1 h-1 rounded-full bg-[#E63946]"></span><span class="text-xs font-mono text-gray-500">' + readingTimeLabel(a.readingTime) + '</span>';
    }
    if (heroCta) heroCta.href = 'article.html?slug=' + encodeURIComponent(a.slug);
    if (heroImg && a.coverImage) {
      heroImg.src = a.coverImage;
      heroImg.alt = a.title;
    }
    // refresh ScrollTrigger if present
    if (window.ScrollTrigger) setTimeout(function () { window.ScrollTrigger.refresh(); }, 80);
  }

  // ─── Hydrate Featured Section ────────────────────────────────────
  async function hydrateFeatured() {
    var section = qs('#featured');
    if (!section) return;
    var data = await fetchJSON('/articles?status=PUBLISHED&limit=4');
    if (!data || !data.items || data.items.length < 2) return;
    var featured = data.items[0];
    var sides = data.items.slice(1, 4);

    var grid = section.querySelector('.grid');
    if (!grid) return;

    // Large card (first col)
    var large = grid.children[0];
    if (large && featured) {
      var img = large.querySelector('img');
      if (img && featured.coverImage) { img.src = featured.coverImage; img.alt = featured.title; }
      var h3 = large.querySelector('h3');
      if (h3) { h3.textContent = featured.title; large.style.cursor = 'pointer'; }
      var p = large.querySelector('p.text-gray-400');
      if (p && featured.excerpt) p.textContent = featured.excerpt;
      large.onclick = function () { location.href = 'article.html?slug=' + encodeURIComponent(featured.slug); };
    }

    // Side cards
    var sideContainer = grid.children[1];
    if (sideContainer && sides.length) {
      var cards = qsa('a.group\\/card', sideContainer);
      sides.forEach(function (art, i) {
        var card = cards[i];
        if (!card) return;
        var img = card.querySelector('img');
        if (img && art.coverImage) { img.src = art.coverImage; img.alt = art.title; }
        var h4 = card.querySelector('h4');
        if (h4) h4.textContent = art.title;
        var cat = card.querySelector('span.text-\\[10px\\]');
        if (cat) cat.textContent = (art.category || '').replace(/_/g, ' ');
        var meta = card.querySelector('p.text-xs');
        if (meta) meta.textContent = readingTimeLabel(art.readingTime) + ' • ' + fmtDate(art.publishedAt);
        card.href = 'article.html?slug=' + encodeURIComponent(art.slug);
      });
    }
  }

  // ─── Hydrate Video Stories (horizontal scroll) ───────────────────
  async function hydrateVideos() {
    var wrap = qs('#horiz-wrap');
    if (!wrap) return;
    var data = await fetchJSON('/videos?status=PUBLISHED&limit=3');
    if (!data || !data.items || !data.items.length) return;
    // Also fetch ticker? not needed
    var videos = data.items;
    // Each child is 1/3 width; we replace content
    var panels = qsa(':scope > div', wrap);
    videos.forEach(function (v, idx) {
      var panel = panels[idx];
      if (!panel) return;
      var titleEl = panel.querySelector('h2');
      if (titleEl) titleEl.textContent = v.title.toUpperCase();
      var badge = panel.querySelector('span.border');
      if (badge) badge.textContent = (v.category || 'Feature').replace(/_/g, ' ');
      var dur = panel.querySelector('span.text-gray-500');
      if (dur && v.duration) {
        var m = Math.floor(v.duration / 60), s = v.duration % 60;
        dur.textContent = m + ':' + String(s).padStart(2, '0');
      }
      var desc = panel.querySelector('.border-l-2 p');
      if (desc && v.description) desc.innerHTML = '<strong class="text-white font-medium">' + escapeHtml(v.title) + '.</strong> ' + escapeHtml(v.description);
      var views = panel.querySelector('span.text-xs.font-mono');
      if (views) views.textContent = (v.viewCount || 0) + ' views • ' + fmtDate(v.publishedAt || v.createdAt);
      // bg image
      var bgImg = panel.querySelector('.absolute.inset-0 img');
      if (bgImg) {
        var t = thumbForVideo(v);
        if (t) { bgImg.src = t; bgImg.alt = v.title; }
      }
      // play button: make it open modal, not redirect
      var play = panel.querySelector('.rounded-full');
      if (play) {
        play.setAttribute('data-video-url', v.videoUrl);
        if (v.embedUrl) play.setAttribute('data-embed-url', v.embedUrl);
        play.style.cursor = 'pointer';
        // wrapper clickable too
        play.closest('div').style.cursor = 'pointer';
      }
      // whole panel clickable to video detail
      panel.style.cursor = 'pointer';
      panel.addEventListener('click', function (e) {
        // if click on play, modal already handled via delegation
        if (e.target.closest('.rounded-full') || e.target.closest('[data-video-url]')) return;
        location.href = 'video.html?slug=' + encodeURIComponent(v.slug);
      });
    });

    // Update header count
    var header = document.querySelector('#videos .font-mono.text-gray-500');
    if (header && videos.length) header.textContent = videos.length + ' STORIES';
  }

  // ─── Hydrate Documentaries ──────────────────────────────────────
  async function hydrateDocs() {
    var section = qs('#docs');
    if (!section) return;
    var data = await fetchJSON('/documentaries?status=PUBLISHED&limit=3');
    if (!data || !data.items || !data.items.length) return;
    var docs = data.items;
    var cards = qsa('#docs .grid > a', document);
    docs.forEach(function (d, i) {
      var card = cards[i];
      if (!card) return;
      var img = card.querySelector('img');
      if (img) {
        var src = d.coverImage || d.thumbnail || thumbForVideo(d);
        if (src) { img.src = src; img.alt = d.title; }
      }
      var h3 = card.querySelector('h3');
      if (h3) h3.textContent = d.title;
      var meta = card.querySelector('span.text-\\[10px\\]');
      if (meta) meta.textContent = 'Documentary • ' + (d.duration ? Math.floor(d.duration/60) + ' min' : '');
      var p = card.querySelector('p');
      if (p && d.description) p.textContent = d.description;
      card.href = 'documentary.html?slug=' + encodeURIComponent(d.slug);
      // play overlay should open player modal, not navigate
      var playBtn = card.querySelector('.rounded-full');
      if (playBtn && d.videoUrl) {
        playBtn.setAttribute('data-video-url', d.videoUrl);
        if (d.embedUrl) playBtn.setAttribute('data-embed-url', d.embedUrl);
        playBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); window.MinimsaahPlayer && window.MinimsaahPlayer.open({ videoUrl: d.videoUrl, embedUrl: d.embedUrl }); });
      }
    });
  }

  // ─── Hydrate News ───────────────────────────────────────────────
  async function hydrateNews() {
    var section = qs('#news');
    if (!section) return;
    var data = await fetchJSON('/articles?status=PUBLISHED&limit=6');
    if (!data || !data.items || !data.items.length) return;
    var items = data.items;
    var cards = qsa('#news .grid > a', document);
    // first card spans 2 cols, rest singles
    items.slice(0, cards.length).forEach(function (art, i) {
      var card = cards[i];
      if (!card) return;
      var img = card.querySelector('img');
      if (img && art.coverImage) { img.src = art.coverImage; img.alt = art.title; }
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
      card.href = 'article.html?slug=' + encodeURIComponent(art.slug);
    });
  }

  // ─── Hydrate Events ─────────────────────────────────────────────
  async function hydrateEvents() {
    var section = qs('#events');
    if (!section) return;
    var data = await fetchJSON('/events?status=PUBLISHED&limit=3');
    if (!data || !data.items || !data.items.length) return;
    var evs = data.items;
    var rows = qsa('#events .flex.flex-col > a', document);
    evs.forEach(function (ev, i) {
      var row = rows[i];
      if (!row) return;
      var day = row.querySelector('span.text-2xl');
      var mon = row.querySelector('span.text-\\[10px\\]');
      if (day) day.textContent = new Date(ev.date).getDate();
      if (mon) mon.textContent = new Date(ev.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      var h3 = row.querySelector('h3');
      if (h3) h3.textContent = ev.title;
      var p = row.querySelector('p.text-gray-500');
      if (p && ev.description) p.textContent = ev.description;
      var loc = row.querySelector('p.text-\\[10px\\].text-gray-600');
      if (loc) loc.textContent = (ev.location || ev.venue || '') + ' • ' + fmtDate(ev.date);
      row.href = 'event.html?slug=' + encodeURIComponent(ev.slug);
    });
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
    hydrateHero();
    hydrateFeatured();
    hydrateVideos();
    hydrateDocs();
    hydrateNews();
    hydrateEvents();

    // Expose for manual refresh
    window.MinimsaahHydrate = {
      hero: hydrateHero,
      featured: hydrateFeatured,
      videos: hydrateVideos,
      docs: hydrateDocs,
      news: hydrateNews,
      events: hydrateEvents,
    };
  });
})();
