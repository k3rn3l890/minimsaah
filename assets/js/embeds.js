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

  function toEmbedUrl(videoUrl, embedUrlFromApi) {
    if (embedUrlFromApi) return embedUrlFromApi;
    var provider = detectProvider(videoUrl);
    if (provider === 'youtube') {
      var id = extractYouTubeId(videoUrl);
      if (id) return 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&playsinline=1&autoplay=1';
    }
    if (provider === 'tiktok') {
      // TikTok embed needs video id numeric
      var m = videoUrl.match(/tiktok\.com\/.*\/video\/(\d+)/);
      if (m) return 'https://www.tiktok.com/embed/' + m[1];
      return videoUrl; // fallback
    }
    if (provider === 'facebook') {
      return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(videoUrl) + '&show_text=0&width=560&height=315';
    }
    if (provider === 'instagram') {
      var clean = videoUrl.split('?')[0].replace(/\/$/, '');
      if (clean.indexOf('/embed') === -1) clean += '/embed';
      return clean;
    }
    return videoUrl;
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
    thumbnailUrl: thumbnailUrl,
    createIframe: createIframe,
  };
})(window);
