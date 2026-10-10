/**
 * Build script: sitemap.xml + pre-rendered story pages for bots.
 * Run with: node scripts/sitemap.js
 * Needs: SUPABASE_URL and SUPABASE_ANON_KEY (same as inject-env.js).
 * If the database cannot be reached, writes a core-only sitemap and
 * skips pre-render — the rewrites still serve every story the old way.
 *
 * Why pre-render instead of a live server: zero runtime risk. Humans and
 * bots get fast static files. Missing slugs fall through to the normal
 * template via vercel.json rewrites. Same words either way.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://minimsaah.vercel.app';
const DEFAULT_IMAGE =
  'https://dndiajfohpmnmocmmokt.supabase.co/storage/v1/object/public/minimsaah-media/0be6735e-acf2-4513-aacb-71189871230c.jpg';

const TYPES = {
  article: { table: 'articles', file: 'article.html', ogType: 'article', schema: 'NewsArticle', dateField: 'published_at', select: 'slug,published_at,title,excerpt,cover_image,author:users(first_name,last_name)' },
  video: { table: 'videos', file: 'video.html', ogType: 'video.other', schema: 'VideoObject', dateField: 'published_at', select: 'slug,published_at,title,description,thumbnail' },
  documentary: { table: 'documentaries', file: 'documentary.html', ogType: 'video.movie', schema: 'Movie', dateField: 'published_at', select: 'slug,published_at,title,description,cover_image' },
  event: { table: 'events', file: 'event.html', ogType: 'website', schema: 'Event', dateField: 'date', select: 'slug,date,title,description,cover_image,location,venue' },
};

function getJSON(url, headers) {
  return new Promise(function (resolve, reject) {
    https
      .get(url, { headers: headers }, function (res) {
        var data = '';
        res.on('data', function (c) { data += c; });
        res.on('end', function () {
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('HTTP ' + res.statusCode));
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      })
      .on('error', reject);
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function text(v, max) {
  v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (v.length > max) v = v.slice(0, max).trim();
  return v;
}

function absImg(u) {
  u = String(u || '').trim();
  if (!u) return DEFAULT_IMAGE;
  if (/^https:\/\//i.test(u)) return u;
  if (u.charAt(0) === '/') return SITE + u;
  return DEFAULT_IMAGE;
}

function safeSlug(s) {
  s = String(s || '');
  if (!s || s.length > 200 || !/^[A-Za-z0-9_.-]+$/.test(s)) return '';
  if (s === '.' || s === '..') return '';
  return s;
}

function headBlock(kind, conf, row, pageUrl) {
  var title = text(row.title, 120) || (kind.charAt(0).toUpperCase() + kind.slice(1) + ' | MINIMSAAH');
  var desc = text(row.excerpt || row.description, 200) || 'Sports stories from Accra, Ghana.';
  var img = absImg(row.cover_image || row.thumbnail);
  var author = 'MINIMSAAH';
  try {
    if (row.author) {
      var nm = ((row.author.first_name || '') + ' ' + (row.author.last_name || '')).trim();
      if (nm) author = nm;
    }
  } catch (e) {}
  var ld = {
    '@context': 'https://schema.org',
    '@type': conf.schema,
    headline: title,
    name: title,
    description: desc,
    image: [img],
    url: pageUrl,
    inLanguage: 'en',
    author: { '@type': 'Person', name: author },
    publisher: { '@type': 'Organization', name: 'MINIMSAAH', url: SITE },
  };
  var pub = row[conf.dateField] || row.published_at || row.created_at;
  if (pub) ld.datePublished = pub;
  return (
    '<title>' + esc(title) + ' | MINIMSAAH</title>\n' +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    '<link rel="canonical" href="' + esc(pageUrl) + '">\n' +
    '<meta name="robots" content="index, follow, max-image-preview:large">\n' +
    '<meta property="og:type" content="' + conf.ogType + '">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:image" content="' + esc(img) + '">\n' +
    '<meta property="og:url" content="' + esc(pageUrl) + '">\n' +
    '<meta property="og:site_name" content="MINIMSAAH">\n' +
    '<meta property="og:locale" content="en_GH">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + esc(title) + '">\n' +
    '<meta name="twitter:description" content="' + esc(desc) + '">\n' +
    '<meta name="twitter:image" content="' + esc(img) + '">\n' +
    '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>'
  );
}

async function main() {
  var supabaseUrl = process.env.SUPABASE_URL || '';
  var supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  var urls = [
    { loc: SITE + '/', changefreq: 'daily', priority: '1.0' },
    { loc: SITE + '/articles', changefreq: 'daily', priority: '0.8' },
    { loc: SITE + '/videos', changefreq: 'daily', priority: '0.8' },
    { loc: SITE + '/documentaries', changefreq: 'weekly', priority: '0.8' },
  ];
  var rendered = 0;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('sitemap: SUPABASE_URL/ANON_KEY missing — core-only sitemap, no pre-render.');
  } else {
    for (var kind of Object.keys(TYPES)) {
      var conf = TYPES[kind];
      var rows = [];
      try {
        var q =
          supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + conf.table +
          '?select=' + encodeURIComponent(conf.select) +
          '&status=eq.PUBLISHED&limit=1000';
        rows = await getJSON(q, { apikey: supabaseAnonKey, Authorization: 'Bearer ' + supabaseAnonKey });
        if (!Array.isArray(rows)) rows = [];
      } catch (e) {
        console.warn('sitemap: fetch failed for ' + conf.table + ' — ' + e.message);
        rows = [];
      }
      var template = '';
      try {
        template = fs.readFileSync(path.join(ROOT, conf.file), 'utf8');
      } catch (e) {
        console.warn('sitemap: template missing ' + conf.file);
        continue;
      }
      if (template.indexOf('META:HEAD-START') === -1) {
        console.warn('sitemap: marker missing in ' + conf.file);
        continue;
      }
      var dir = path.join(ROOT, kind);
      fs.mkdirSync(dir, { recursive: true });
      rows.forEach(function (row) {
        var slug = safeSlug(row.slug);
        if (!slug) return;
        var pageUrl = SITE + '/' + kind + '/' + encodeURIComponent(slug);
        var block = headBlock(kind, conf, row, pageUrl);
        var out = template.replace(
          /<!--META:HEAD-START-->[\s\S]*?<!--META:HEAD-END-->/,
          '<!--META:HEAD-START-->\n' + block + '\n<!--META:HEAD-END-->'
        );
        // Drop the generic static title/description outside the marker —
        // the marker now holds the story-specific copies. One of each only.
        var mTitle = block.match(/<title>([\s\S]*?)<\/title>/);
        if (mTitle) out = out.replace(/<title>[\s\S]*?<\/title>\n?/, '');
        var mDesc = block.match(/<meta name="description" content="([\s\S]*?)">/);
        if (mDesc) {
          out = out.replace(
            /<meta name="description" content="[\s\S]*?">\n?/,
            ''
          );
        }
        fs.writeFileSync(path.join(dir, slug + '.html'), out);
        rendered++;
        var lm = row[conf.dateField] || row.published_at || row.created_at;
        urls.push({
          loc: pageUrl,
          lastmod: lm ? String(lm).slice(0, 10) : undefined,
          changefreq: 'weekly',
          priority: '0.6',
        });
      });
      console.log('sitemap: ' + rows.length + ' ' + conf.table + ' rows, pages kept in /' + kind + '/');
    }
  }

  var xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(function (u) {
        return (
          '  <url>\n    <loc>' + esc(u.loc) + '</loc>\n' +
          (u.lastmod ? '    <lastmod>' + esc(u.lastmod) + '</lastmod>\n' : '') +
          '    <changefreq>' + u.changefreq + '</changefreq>\n' +
          '    <priority>' + u.priority + '</priority>\n  </url>'
        );
      })
      .join('\n') +
    '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log('sitemap: wrote sitemap.xml with ' + urls.length + ' urls, pre-rendered ' + rendered + ' story pages.');
}

main().catch(function (e) {
  console.error('sitemap: ' + e.message);
  process.exit(1);
});
