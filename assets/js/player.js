/**
 * MINIMSAAH — player.js
 * In-site video modal. Plays inside minimsaah_v1 first.
 * If the provider blocks in-site playback, offers a clean handover
 * to watch on the provider site (new tab) — never a dead box.
 * Shows thumbnail -> click -> iframe stays inside minimsaah_v1
 */
(function () {
  var modal = null;
  var currentIframe = null;
  var loadTimer = null;
  var pendingVideo = null;

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'video-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Video player');
    modal.style.cssText = 'position:fixed;inset:0;z-index:10001;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);padding:16px;';
    modal.innerHTML =
      '<div style="position:relative;width:100%;max-width:960px;aspect-ratio:16/9;background:#000;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;max-height:90vh;">' +
      '  <button id="video-modal-close" aria-label="Close video" style="position:absolute;top:10px;right:10px;z-index:3;width:36px;height:36px;border-radius:999px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.2);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">✕</button>' +
      '  <div id="video-modal-poster" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#000;">' +
      '    <img id="video-modal-thumb" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.6;">' +
      '    <span style="position:relative;z-index:1;width:76px;height:76px;border-radius:999px;background:rgba(230,57,70,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(230,57,70,0.4);"><svg width="34" height="34" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span>' +
      '  </div>' +
      '  <div id="video-modal-body" style="width:100%;height:100%;"></div>' +
      '  <div id="video-modal-blocked" style="display:none;position:absolute;inset:0;z-index:2;background:#000;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;text-align:center;">' +
      '    <p id="video-modal-blocked-text" style="color:#d1d5db;font-size:14px;">This video cannot play right now.</p>' +
      '    <button id="video-modal-retry" style="background:#E63946;color:#fff;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;padding:12px 24px;border-radius:4px;border:0;cursor:pointer;">Try Again</button>' +
      '    <a id="video-modal-watch" href="#" target="_blank" rel="noopener" style="color:#9ca3af;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:underline;">Watch on provider</a>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    // close handlers
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    modal.querySelector('#video-modal-close').addEventListener('click', close);
    modal.querySelector('#video-modal-poster').addEventListener('click', function () { loadFrame(false); });
    modal.querySelector('#video-modal-retry').addEventListener('click', function () { loadFrame(true); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') close();
    });
    return modal;
  }

  function posterFor(video) {
    try {
      if (window.MinimsaahEmbeds) {
        var t = window.MinimsaahEmbeds.thumbnailUrl({ videoUrl: video.videoUrl, thumbnail: video.thumbnail, coverImage: video.coverImage });
        if (t) return t;
      }
    } catch (e) {}
    return video.thumbnail || '';
  }

  // The frame is built only after the visitor presses play (cold frames
  // trigger provider bot-blocks). Retry rebuilds once with a fresh URL.
  function loadFrame(retry) {
    if (!pendingVideo) return;
    var m = ensureModal();
    var body = m.querySelector('#video-modal-body');
    var poster = m.querySelector('#video-modal-poster');
    var blocked = m.querySelector('#video-modal-blocked');
    blocked.style.display = 'none';
    body.innerHTML = '';
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    var video = pendingVideo;
    var provider = window.MinimsaahEmbeds ? window.MinimsaahEmbeds.detectProvider(video.videoUrl) : 'unknown';
    var embed = window.MinimsaahEmbeds ? window.MinimsaahEmbeds.toEmbedUrl(video.videoUrl, video.embedUrl) : video.embedUrl || video.videoUrl;
    var allowed = window.MinimsaahEmbeds
      ? (window.MinimsaahEmbeds.isAllowedEmbedUrl(embed) || window.MinimsaahEmbeds.isNativeMedia(embed))
      : (/^https:\/\//i.test(embed || ''));
    if (!embed || !allowed) {
      showBlocked(video, provider);
      return;
    }
    if (retry) embed += (embed.indexOf('?') === -1 ? '?' : '&') + 'msretry=' + Date.now();

    // TikTok modal needs different aspect
    if (provider === 'tiktok') {
      m.firstElementChild.style.aspectRatio = '9/16';
      m.firstElementChild.style.maxWidth = '420px';
      m.firstElementChild.style.height = '85vh';
      body.style.overflow = 'hidden';
    } else {
      m.firstElementChild.style.aspectRatio = '16/9';
      m.firstElementChild.style.maxWidth = '960px';
      m.firstElementChild.style.height = 'auto';
    }

    var iframe = window.MinimsaahEmbeds ? window.MinimsaahEmbeds.createIframe(embed, provider) : (function () {
      var f = document.createElement('iframe');
      f.src = embed; f.style.width = '100%'; f.style.height = '100%'; f.setAttribute('allowfullscreen','true'); f.setAttribute('frameborder','0');
      return f;
    })();
    if (!iframe) {
      showBlocked(video, provider);
      return;
    }
    poster.style.display = 'none';
    // If the frame never reports back, offer a friendly retry (no outside links).
    var settled = false;
    try {
      iframe.addEventListener('load', function () {
        settled = true;
        if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      });
    } catch (e) {}
    loadTimer = setTimeout(function () {
      if (!settled) {
        try { showBlocked(video, provider); } catch (e) {}
      }
    }, 15000);
    body.appendChild(iframe);
    currentIframe = iframe;
  }

  function open(video) {
    // video: { videoUrl, embedUrl, title, thumbnail }
    if (!video || !video.videoUrl) return;
    pendingVideo = video;
    currentIframe = null;
    var m = ensureModal();
    var body = m.querySelector('#video-modal-body');
    var poster = m.querySelector('#video-modal-poster');
    var blocked = m.querySelector('#video-modal-blocked');
    var thumb = m.querySelector('#video-modal-thumb');
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    body.innerHTML = '';
    blocked.style.display = 'none';
    poster.style.display = 'flex';
    try { thumb.src = posterFor(video); thumb.alt = video.title || ''; } catch (e) {}
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // focus close for a11y
    setTimeout(function () { m.querySelector('#video-modal-close').focus(); }, 50);
  }

  function close() {
    if (!modal) return;
    pendingVideo = null;
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
    var body = modal.querySelector('#video-modal-body');
    if (body) body.innerHTML = '';
    var blocked = modal.querySelector('#video-modal-blocked');
    if (blocked) blocked.style.display = 'none';
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Expose
  window.MinimsaahPlayer = { open: open, close: close, ensureModal: ensureModal };

  // Auto-bind: any element with [data-video-url] will open in modal (in-site first)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-video-url]');
    if (!el) return;
    e.preventDefault();
    var videoUrl = el.getAttribute('data-video-url');
    var embedUrl = el.getAttribute('data-embed-url') || '';
    var title = el.getAttribute('data-video-title') || '';
    if (videoUrl) open({ videoUrl: videoUrl, embedUrl: embedUrl, title: title });
  });

  function providerName(p) {
    if (p === 'youtube') return 'YouTube';
    if (p === 'tiktok') return 'TikTok';
    if (p === 'facebook') return 'Facebook';
    if (p === 'instagram') return 'Instagram';
    return 'the provider site';
  }

  // Central handover: friendly note + Try Again + watch-on-provider link.
  // Shown when the frame is bad, missing, or never reports back.
  function showBlocked(video, provider) {
    var m = ensureModal();
    var blocked = m.querySelector('#video-modal-blocked');
    var txt = m.querySelector('#video-modal-blocked-text');
    var watch = m.querySelector('#video-modal-watch');
    var name = providerName(provider);
    if (txt) txt.textContent = 'This video cannot play here right now' + (provider && provider !== 'unknown' ? ' (' + name + ' is blocking in-site playback)' : '') + '.';
    if (watch) {
      if (video && video.videoUrl && /^https:\/\//i.test(video.videoUrl)) {
        watch.style.display = '';
        watch.href = video.videoUrl;
        watch.textContent = provider && provider !== 'unknown' ? 'Watch on ' + name : 'Watch on provider site';
      } else {
        watch.style.display = 'none';
      }
    }
    blocked.style.display = 'flex';
  }
})();
