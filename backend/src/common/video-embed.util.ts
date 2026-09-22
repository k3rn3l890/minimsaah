/**
 * MINIMSAAH — Video Embed Utility
 * Supports YouTube, TikTok, Facebook, Instagram
 * Returns { embedUrl, thumbnail, provider } without redirecting user.
 * Thumbnails: YouTube = direct, others via oEmbed fetch (fallback to null).
 */

export type VideoProvider = 'youtube' | 'tiktok' | 'facebook' | 'instagram' | 'unknown';

export interface EmbedResult {
  provider: VideoProvider;
  embedUrl: string | null;
  thumbnail: string | null;
  videoId: string | null;
}

// ─── Detectors ────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractTikTokId(url: string): string | null {
  // tiktok.com/@user/video/1234567890123456789 or vm.tiktok.com/abc
  const m = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
  if (m) return m[1];
  const short = url.match(/vm\.tiktok\.com\/([A-Za-z0-9]+)/);
  if (short) return short[1];
  return null;
}

function detectProvider(url: string): VideoProvider {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('instagram.com')) return 'instagram';
  return 'unknown';
}

// ─── Embed URL Builders (in-site iframe, no redirect) ─────────

function buildYouTubeEmbed(videoId: string): string {
  // youtube-nocookie for privacy + no redirect
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;
}

function buildTikTokEmbed(url: string, videoId?: string | null): string {
  // TikTok official embed: https://www.tiktok.com/embed/<id>
  // If we have a full url, use it directly as embed src via tiktok embed endpoint.
  if (videoId && /^\d+$/.test(videoId)) {
    return `https://www.tiktok.com/embed/${videoId}`;
  }
  // Fallback: try to use original url with embed param (works for vm links after fetch)
  return url;
}

function buildFacebookEmbed(url: string): string {
  const encoded = encodeURIComponent(url);
  return `https://www.facebook.com/plugins/video.php?href=${encoded}&show_text=0&width=560&height=315`;
}

function buildInstagramEmbed(url: string): string {
  // Instagram embed via /embed endpoint (works without token for public posts)
  // normalize: https://www.instagram.com/p/ABC123/ -> https://www.instagram.com/p/ABC123/embed
  let clean = url.split('?')[0].replace(/\/$/, '');
  if (!clean.endsWith('/embed')) clean += '/embed';
  // ensure /embed with cap handling: /reel/, /p/, /tv/
  return clean;
}

// ─── Thumbnail Resolvers ─────────────────────────────────────

function youtubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

async function fetchOEmbedThumbnail(url: string, endpoint: string): Promise<string | null> {
  try {
    // Use global fetch (Node 18+). Timeout 2.5s.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${endpoint}?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MINIMSAAH/1.0' },
    } as any);
    clearTimeout(t);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.thumbnail_url || data.thumbnailUrl || null;
  } catch {
    return null;
  }
}

async function resolveThumbnail(provider: VideoProvider, url: string, videoId: string | null): Promise<string | null> {
  if (provider === 'youtube' && videoId) return youtubeThumbnail(videoId);
  if (provider === 'tiktok') return await fetchOEmbedThumbnail(url, 'https://www.tiktok.com/oembed');
  if (provider === 'facebook') return await fetchOEmbedThumbnail(url, 'https://graph.facebook.com/v18.0/oembed_video');
  if (provider === 'instagram') {
    // Try instagram oEmbed (may require token — fail gracefully)
    const thumb = await fetchOEmbedThumbnail(url, 'https://graph.facebook.com/v18.0/instagram_oembed');
    if (thumb) return thumb;
    // fallback public oembed
    return await fetchOEmbedThumbnail(url, 'https://api.instagram.com/oembed');
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────

export async function buildEmbed(url: string, customThumbnail?: string | null): Promise<EmbedResult> {
  if (!url || typeof url !== 'string') return { provider: 'unknown', embedUrl: null, thumbnail: null, videoId: null };
  const provider = detectProvider(url);
  let embedUrl: string | null = null;
  let videoId: string | null = null;
  let thumbnail: string | null = customThumbnail || null;

  if (provider === 'youtube') {
    videoId = extractYouTubeId(url);
    if (videoId) {
      embedUrl = buildYouTubeEmbed(videoId);
      if (!thumbnail) thumbnail = youtubeThumbnail(videoId);
    }
  } else if (provider === 'tiktok') {
    videoId = extractTikTokId(url);
    embedUrl = buildTikTokEmbed(url, videoId);
    if (!thumbnail) thumbnail = await resolveThumbnail(provider, url, videoId);
  } else if (provider === 'facebook') {
    embedUrl = buildFacebookEmbed(url);
    if (!thumbnail) thumbnail = await resolveThumbnail(provider, url, null);
  } else if (provider === 'instagram') {
    embedUrl = buildInstagramEmbed(url);
    if (!thumbnail) thumbnail = await resolveThumbnail(provider, url, null);
  } else {
    // unknown — keep original as embed if it looks like mp4/m3u8
    if (url.match(/\.(mp4|webm|m3u8)(\?|$)/i)) embedUrl = url;
  }

  return { provider, embedUrl, thumbnail, videoId };
}

// Sync version (no network, for quick preview)
export function buildEmbedSync(url: string): EmbedResult {
  if (!url) return { provider: 'unknown', embedUrl: null, thumbnail: null, videoId: null };
  const provider = detectProvider(url);
  if (provider === 'youtube') {
    const id = extractYouTubeId(url);
    if (id) return { provider, embedUrl: buildYouTubeEmbed(id), thumbnail: youtubeThumbnail(id), videoId: id };
  }
  if (provider === 'tiktok') {
    const id = extractTikTokId(url);
    return { provider, embedUrl: buildTikTokEmbed(url, id), thumbnail: null, videoId: id };
  }
  if (provider === 'facebook') return { provider, embedUrl: buildFacebookEmbed(url), thumbnail: null, videoId: null };
  if (provider === 'instagram') return { provider, embedUrl: buildInstagramEmbed(url), thumbnail: null, videoId: null };
  return { provider: 'unknown', embedUrl: null, thumbnail: null, videoId: null };
}
