/**
 * MINIMSAAH — embeds.js
 * Client-side helpers for YouTube/TikTok/Facebook/Instagram
 * No redirect: all videos play via iframe inside minimsaah_v1
 */

(function (global) {
  function extractYouTubeId(url) {
    if (!url) return null;
    var patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
      /youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{11})/,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = url.match(patterns[i]);
      if (m) return m[1];
    }
    return null;
  }

  function detectProvider(url) {
    if (!url) return 'unknown';
    var u = url.toLowerCase();
    if (u.indexOf('youtube.com') !== -1 || u.indexOf('youtu.be') !== -1) return 'youtube';
    if (u.indexOf('tiktok.com') !== -1) return 'tiktok';
    if (u.indexOf('facebook.com') !== -1 || u.indexOf('fb.watch') !== -1) return 'facebook';
    if (u.indexOf('instagram.com') !== -1) return 'instagram';
    if (/\.(mp4|webm|m3u8)(\?|$)/i.test(url)) return 'native';
    return 'unknown';
  }

  // Hosts we will ever place in an <iframe>. Anything else (including
  // javascript:/data:/blob:) is rejected — embedUrlFromApi is DB-controlled
  // and previously bypassed every check below.
  var EMBED_HOSTS = [
    'www.youtube-nocookie.com', 'www.youtube.com', 'youtube.com',
    'youtu.be', 'www.tiktok.com', 'tiktok.com',
    'www.facebook.com', 'facebook.com', 'fb.watch',
    'www.instagram.com', 'instagram.com',
  ];

  function isAllowedEmbedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.toLowerCase().indexOf('https://') !== 0) return false;
    var host;
    try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
    return EMBED_HOSTS.indexOf(host) !== -1;
  }

  // Direct media files never go in an iframe (no controls, sandbox-hostile);
  // callers render these with a native <video> element instead.
  function isNativeMedia(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url) && /\.(mp4|webm|m3u8)(\?|$)/i.test(url);
  }

  function toEmbedUrl(videoUrl, embedUrlFromApi) {
    if (embedUrlFromApi && isAllowedEmbedUrl(embedUrlFromApi)) return embedUrlFromApi;
    if (isNativeMedia(videoUrl)) return videoUrl;
    var provider = detectProvider(videoUrl);
    var built = '';
    if (provider === 'youtube') {
      var id = extractYouTubeId(videoUrl);
      if (id) built = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&playsinline=1&autoplay=1';
    } else if (provider === 'tiktok') {
      // TikTok embed needs video id numeric
      var m = videoUrl.match(/tiktok\.com\/.*\/video\/(\d+)/);
      if (m) built = 'https://www.tiktok.com/embed/' + m[1];
    } else if (provider === 'facebook') {
      built = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(videoUrl) + '&show_text=0&width=560&height=315';
    } else if (provider === 'instagram') {
      var clean = videoUrl.split('?')[0].replace(/\/$/, '');
      if (clean.indexOf('/embed') === -1) clean += '/embed';
      built = clean;
    }
    return isAllowedEmbedUrl(built) ? built : '';
  }

  function thumbnailUrl(video, fallback) {
    if (video && video.thumbnail) return video.thumbnail;
    if (video && video.coverImage) return video.coverImage;
    // YouTube fallback
    var id = extractYouTubeId(video && video.videoUrl || '');
    if (id) return 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg';
    return fallback || 'https://images.pexels.com/photos/31471420/pexels-photo-31471420.jpeg?auto=compress&cs=tinysrgb&w=800';
  }

  function createIframe(embedUrl, provider) {
    // Defense in depth: never frame a URL the allowlist rejects. Direct
    // media files get a native <video> (controls, no iframe weirdness).
    if (isNativeMedia(embedUrl)) {
      var v = document.createElement('video');
      v.src = embedUrl;
      v.setAttribute('controls', 'true');
      v.setAttribute('playsinline', 'true');
      v.setAttribute('preload', 'metadata');
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.border = '0';
      v.style.background = '#000';
      return v;
    }
    if (!isAllowedEmbedUrl(embedUrl)) return null;
    var iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    // TikTok needs taller
    if (provider === 'tiktok') {
      iframe.style.minHeight = '560px';
    }
    return iframe;
  }

  global.MinimsaahEmbeds = {
    detectProvider: detectProvider,
    extractYouTubeId: extractYouTubeId,
    toEmbedUrl: toEmbedUrl,
    isAllowedEmbedUrl: isAllowedEmbedUrl,
    isNativeMedia: isNativeMedia,
    thumbnailUrl: thumbnailUrl,
    createIframe: createIframe,
  };
})(window);
