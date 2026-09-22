/**
 * MINIMSAAH — player.js
 * In-site video modal. No redirect to YouTube/TikTok/Facebook/Instagram.
 * Shows thumbnail -> click -> iframe stays inside minimsaah_v1
 */
(function () {
  var modal = null;
  var currentIframe = null;

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
      '  <button id="video-modal-close" aria-label="Close video" style="position:absolute;top:10px;right:10px;z-index:2;width:36px;height:36px;border-radius:999px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.2);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">✕</button>' +
      '  <div id="video-modal-body" style="width:100%;height:100%;"></div>' +
      '</div>';
    document.body.appendChild(modal);

    // close handlers
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    modal.querySelector('#video-modal-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') close();
    });
    return modal;
  }

  function open(video) {
    // video: { videoUrl, embedUrl, title }
    if (!video || !video.videoUrl) return;
    var m = ensureModal();
    var body = m.querySelector('#video-modal-body');
    body.innerHTML = '';
    var embed = window.MinimsaahEmbeds ? window.MinimsaahEmbeds.toEmbedUrl(video.videoUrl, video.embedUrl) : video.embedUrl || video.videoUrl;
    var provider = window.MinimsaahEmbeds ? window.MinimsaahEmbeds.detectProvider(video.videoUrl) : 'unknown';

    // For instagram, use iframe with embed url; for others same
    var iframe = window.MinimsaahEmbeds ? window.MinimsaahEmbeds.createIframe(embed, provider) : (function () {
      var f = document.createElement('iframe');
      f.src = embed; f.style.width = '100%'; f.style.height = '100%'; f.setAttribute('allowfullscreen','true'); f.setAttribute('frameborder','0');
      return f;
    })();

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

    body.appendChild(iframe);
    currentIframe = iframe;
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // focus close for a11y
    setTimeout(function () { m.querySelector('#video-modal-close').focus(); }, 50);
  }

  function close() {
    if (!modal) return;
    var body = modal.querySelector('#video-modal-body');
    if (body) body.innerHTML = '';
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Expose
  window.MinimsaahPlayer = { open: open, close: close, ensureModal: ensureModal };

  // Auto-bind: any element with [data-video-url] will open in modal (no redirect)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-video-url]');
    if (!el) return;
    e.preventDefault();
    var videoUrl = el.getAttribute('data-video-url');
    var embedUrl = el.getAttribute('data-embed-url') || '';
    var title = el.getAttribute('data-video-title') || '';
    if (videoUrl) open({ videoUrl: videoUrl, embedUrl: embedUrl, title: title });
  });
})();
