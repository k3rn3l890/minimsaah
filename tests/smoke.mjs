/**
 * MINIMSAAH — smoke tests (Phase 2).
 * Run with: npm test  (node --test tests/smoke.mjs)
 * Plain Node asserts, zero network, zero database. Milliseconds.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// ---- browser stubs for IIFE scripts (admin.js, embeds.js) ----
function browserStubs() {
  const store = {};
  const stubWindow = { __API_BASE__: '' };
  const stubLocation = { hostname: 'test', pathname: '/', search: '' };
  const stubLocalStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const stubDocument = {
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
    }),
    body: { appendChild() {} },
    getElementById: () => null,
  };
  return { stubWindow, stubLocation, stubLocalStorage, stubDocument, store };
}

function loadBrowserScript(relPath, stubs) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const fn = new Function('window', 'location', 'document', 'localStorage', 'fetch', src);
  fn(stubs.stubWindow, stubs.stubLocation, stubs.stubDocument, stubs.stubLocalStorage, () => {
    throw new Error('network disabled in tests');
  });
  return stubs.stubWindow;
}

let Admin;
let Embeds;
let Lib;
before(() => {
  Admin = loadBrowserScript('admin/js/admin.js', browserStubs()).Admin;
  Embeds = loadBrowserScript('assets/js/embeds.js', browserStubs()).MinimsaahEmbeds;
  Lib = loadBrowserScript('assets/js/lib.js', browserStubs()).MinimsaahLib;
});

// ---- 1. sitemap helpers ----
describe('sitemap helpers', () => {
  const sm = require('../scripts/sitemap.js');

  it('safeSlug accepts good slugs', () => {
    assert.equal(sm.safeSlug('hello-world-1'), 'hello-world-1');
  });

  it('safeSlug rejects evil slugs', () => {
    assert.equal(sm.safeSlug('../../etc/passwd'), '');
    assert.equal(sm.safeSlug('a b'), '');
    assert.equal(sm.safeSlug('..'), '');
    assert.equal(sm.safeSlug('x'.repeat(201)), '');
    assert.equal(sm.safeSlug(''), '');
  });

  it('esc neutralises HTML', () => {
    assert.equal(sm.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('headBlock escapes evil titles and sets canonical', () => {
    const html = sm.headBlock(
      'article',
      sm.TYPES.article,
      { title: 'Hi <b>there</b>', excerpt: 'd', slug: 'x' },
      'https://minimsaah.vercel.app/article/x'
    );
    assert.ok(!html.includes('<b>there</b>'));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes('application/ld+json'));
  });

  it('TYPES covers all four story kinds', () => {
    assert.deepEqual(Object.keys(sm.TYPES).sort(), ['article', 'documentary', 'event', 'video']);
  });
});

// ---- 2. inject-env stamp ----
describe('inject-env stamp', () => {
  const inj = require('../scripts/inject-env.js');

  it('stampContent adds a stamp', () => {
    const out = inj.stampContent('<script src="/assets/js/app.js"></script>', 'abc123');
    assert.ok(out.includes('/assets/js/app.js?v=abc123'));
  });

  it('stampContent replaces an old stamp (idempotent)', () => {
    const once = inj.stampContent('<script src="/assets/js/app.js?v=old1"></script>', 'new9');
    assert.ok(once.includes('?v=new9'));
    assert.ok(!once.includes('?v=old1'));
    const twice = inj.stampContent(once, 'new9');
    assert.equal(twice, once);
  });

  it('stampContent leaves non-script text alone', () => {
    assert.equal(inj.stampContent('<p>hello</p>', 'z'), '<p>hello</p>');
  });

  it('stampContent stamps compiled CSS links (immutable cache)', () => {
    assert.equal(
      inj.stampContent('<link rel="stylesheet" href="/assets/css/tailwind.css">', 'abc123'),
      '<link rel="stylesheet" href="/assets/css/tailwind.css?v=abc123">'
    );
    const once = inj.stampContent('<link rel="stylesheet" href="/assets/css/tailwind.css?v=old1">', 'new9');
    assert.ok(once.includes('?v=new9'));
    assert.ok(!once.includes('?v=old1'));
  });

  it('buildTag returns letters and digits only', () => {
    assert.match(inj.buildTag(), /^[A-Za-z0-9]+$/);
  });

  it('pinned tag tracks package.json version with SRI', () => {
    const pkg = require('../package.json');
    const ver = String(pkg.dependencies['@supabase/supabase-js']).replace(/^[\^~>=<\s]+/, '');
    assert.ok(ver.length > 0);
    assert.equal(inj.supabaseVersion(), ver);
    const tag = inj.pinnedSupabaseTag();
    assert.ok(tag.includes(`@supabase/supabase-js@${ver}`));
    assert.ok(tag.includes('integrity="sha384-'));
  });

  it('verifyCommittedPlaceholders passes on clean tree', () => {
    assert.equal(inj.verifyCommittedPlaceholders(), 0);
  });
});

// ---- 3. shared input checker ----
describe('Admin.cleanField', () => {
  const cases = [
    [{ v: '<script>alert(1)</script>', o: { label: 'Title', max: 200, noCode: true }, want: false }, 'blocks code signs'],
    [{ v: 'Hello World', o: { label: 'Title', max: 200, noCode: true }, want: true }, 'passes clean title'],
    [{ v: 'a'.repeat(201), o: { label: 'Title', max: 200, noCode: true }, want: false }, 'blocks over max'],
    [{ v: 'Bad Slug!', o: { label: 'Slug', slug: true }, want: false }, 'blocks bad slug'],
    [{ v: 'good-slug-1', o: { label: 'Slug', slug: true }, want: true }, 'passes good slug'],
    [{ v: 'not-an-email', o: { label: 'Email', email: true }, want: false }, 'blocks bad email'],
    [{ v: 'http://x.com', o: { label: 'Link', urlHttps: true }, want: false }, 'blocks http link'],
    [{ v: 'https://x.com', o: { label: 'Link', urlHttps: true }, want: true }, 'passes https link'],
    [{ v: '12a', o: { label: 'Code', digits: true }, want: false }, 'blocks non-digits'],
    [{ v: '5', o: { label: 'N', intRange: [0, 10] }, want: true }, 'passes in-range int'],
    [{ v: '99', o: { label: 'N', intRange: [0, 10] }, want: false }, 'blocks out-of-range int'],
    [{ v: 'X', o: { label: 'S', oneOf: ['A', 'B'] }, want: false }, 'blocks bad choice'],
    [{ v: '', o: { label: 'Req' }, want: false }, 'blocks empty required'],
  ];
  for (const [{ v, o, want }, name] of cases) {
    it(name, () => {
      assert.equal(Admin.cleanField(v, o).ok, want);
    });
  }

  it('lowercases emails', () => {
    assert.equal(Admin.cleanField('A@B.CO', { label: 'Email', email: true }).value, 'a@b.co');
  });

  it('cleanSearch strips wildcards and code signs, caps length', () => {
    assert.equal(Admin.cleanSearch('ab%cd_ef', 100), 'abcdef');
    assert.equal(Admin.cleanSearch('<b>x</b>', 100), 'bx/b');
    assert.equal(Admin.cleanSearch('y'.repeat(500), 100).length, 100);
  });
});

// ---- 4. budget helper ----
describe('Admin.budget', () => {
  it('allows N then blocks', () => {
    assert.equal(Admin.budget('smoke-a', 2, 60000), true);
    assert.equal(Admin.budget('smoke-a', 2, 60000), true);
    assert.equal(Admin.budget('smoke-a', 2, 60000), false);
  });

  it('keys are independent', () => {
    assert.equal(Admin.budget('smoke-b', 1, 60000), true);
  });
});

// ---- 5. video link helpers ----
describe('MinimsaahEmbeds', () => {
  it('checkVideoLink passes a good YouTube link', () => {
    const r = Embeds.checkVideoLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(r.ok, true);
  });

  it('checkVideoLink blocks malformed links', () => {
    assert.equal(Embeds.checkVideoLink('https://www.youtube.com/watch?v=short').ok, false);
    assert.equal(Embeds.checkVideoLink('https://www.tiktok.com/@a/video/123').ok, false);
    assert.equal(Embeds.checkVideoLink('https://evil.example.com/x').ok, false);
  });

  it('cleanVideoUrl rebuilds short YouTube links', () => {
    assert.equal(
      Embeds.cleanVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=30'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
  });

  it('cleanVideoUrl unifies phone hosts and drops junk', () => {
    assert.equal(
      Embeds.cleanVideoUrl('https://m.tiktok.com/@a/video/1234567890123456789?lang=en'),
      'https://www.tiktok.com/@a/video/1234567890123456789'
    );
    assert.equal(Embeds.cleanVideoUrl('junk'), '');
  });

  it('thumbnailUrl has no fake default (unknown means empty)', () => {
    assert.equal(Embeds.thumbnailUrl({}), '');
  });

  it('createIframe is sandboxed with title and lazy load', () => {
    const els = [];
    const fakeDoc = {
      createElement: (tag) => {
        const el = {
          tag,
          attrs: {},
          style: {},
          setAttribute(k, v) { this.attrs[k] = v; },
          addEventListener() {},
        };
        els.push(el);
        return el;
      },
    };
    const src = fs.readFileSync(path.join(ROOT, 'assets/js/embeds.js'), 'utf8');
    const fn = new Function('window', 'document', 'fetch', src);
    const win = {};
    const origDoc = globalThis.document;
    try {
      globalThis.document = fakeDoc;
      fn(win, fakeDoc, () => { throw new Error('no network'); });
    } finally {
      if (origDoc === undefined) delete globalThis.document;
      else globalThis.document = origDoc;
    }
    const E = win.MinimsaahEmbeds;
    const f = E.createIframe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube');
    assert.ok(f);
    assert.ok(String(f.attrs.sandbox).includes('allow-scripts'));
    assert.ok(!String(f.attrs.sandbox).includes('allow-top-navigation'));
    assert.ok(f.attrs.title.length > 0);
    assert.equal(f.attrs.loading, 'lazy');
    assert.equal(E.createIframe('javascript:alert(1)', 'youtube'), null);
  });
});

// ---- 8. shared page library (Phase 4) ----
describe('MinimsaahLib', () => {
  it('esc matches the per-page original', () => {
    assert.equal(Lib.esc('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
    assert.equal(Lib.esc(null), '');
    assert.equal(Lib.esc(undefined), '');
  });

  it('normRow maps snake_case to camelCase, keeps both', () => {
    const r = Lib.normRow({ first_name: 'A', title: 'T' });
    assert.equal(r.firstName, 'A');
    assert.equal(r.first_name, 'A');
    assert.equal(r.title, 'T');
    assert.equal(Lib.normRow(null), null);
    assert.deepEqual(Lib.normRow([1]), [1]);
  });

  it('fmtDate formats en-GB or returns input', () => {
    assert.equal(Lib.fmtDate('2026-01-05'), '5 Jan 2026');
  });

  it('show toggles hidden', () => {
    let v = null;
    Lib.show({ classList: { toggle: (c, off) => { v = off; } } }, false);
    assert.equal(v, true);
  });

  it('safeSlug encodes slug-or-id, empty on bad', () => {
    assert.equal(Lib.safeSlug({ slug: 'a-b' }), 'a-b');
    assert.equal(Lib.safeSlug({ id: 'x' }), 'x');
    assert.equal(Lib.safeSlug({}), '');
  });

  it('durLabel formats m:ss, empty when unknown', () => {
    assert.equal(Lib.durLabel(312), '5:12');
    assert.equal(Lib.durLabel({ duration: 486 }), '8:06');
    assert.equal(Lib.durLabel(null), '');
    assert.equal(Lib.durLabel(0), '');
  });

  it('cleanQuery matches the page filter cleaner', () => {
    assert.equal(Lib.cleanQuery('  Hello%_World  '), 'hello%_world'.replace(/[%_]/g, ''));
    assert.equal(Lib.cleanQuery('y'.repeat(500)).length, 100);
  });

  it('sortFeaturedFirst puts featured first, dateless last', () => {
    const rows = [
      { t: 'plain-new', publishedAt: '2026-09-19' },
      { t: 'feat-old', featured: true, publishedAt: '2020-01-01' },
      { t: 'nodate' },
    ];
    assert.deepEqual(Lib.sortFeaturedFirst(rows).map((x) => x.t), ['feat-old', 'plain-new', 'nodate']);
  });

  it('fetchPublished strict throws on failure, [] when empty', async () => {
    const stubs = browserStubs();
    stubs.stubWindow.SupabaseDB = {
      isEnabled: () => true,
      client: () => ({ from: () => { throw new Error('down'); } }),
    };
    const L2 = loadBrowserScript('assets/js/lib.js', stubs).MinimsaahLib;
    await assert.rejects(L2.fetchPublished('articles', 'published_at', 100, { strict: true }), /not found/);
    const calm = await L2.fetchPublished('articles', 'published_at', 100);
    assert.deepEqual(calm, []);
  });

  it('fetchPublished pages with offset via range (stable server order)', async () => {
    const seen = [];
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: String(i), slug: `s-${i}` }));
    const stubs = browserStubs();
    stubs.stubWindow.SupabaseDB = {
      isEnabled: () => true,
      client: () => ({
        from: (table) => ({
          select: () => ({
            eq: () => ({
              order: (field, opts) => {
                seen.push({ table, field, asc: opts.ascending });
                return {
                  limit: async (n) => ({ error: null, data: rows.slice(0, n) }),
                  range: async (a, b) => ({ error: null, data: rows.slice(a, b + 1) }),
                };
              },
            }),
          }),
        }),
      }),
    };
    const L2 = loadBrowserScript('assets/js/lib.js', stubs).MinimsaahLib;
    const p1 = await L2.fetchPublished('articles', 'published_at', 100);
    const p2 = await L2.fetchPublished('articles', 'published_at', 100, { offset: 100 });
    const p3 = await L2.fetchPublished('articles', 'published_at', 100, { offset: 200 });
    assert.equal(p1.length, 100);
    assert.equal(p1[0].id, '0');
    assert.equal(p2[0].id, '100');
    assert.equal(p3.length, 50);
    assert.ok(seen.every((s) => s.field === 'published_at' && s.asc === false));
  });

  it('makePager appends pages in order and ends on a short page', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: String(i), slug: `s-${i}` }));
    const stubs = browserStubs();
    stubs.stubWindow.SupabaseDB = {
      isEnabled: () => true,
      client: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async (n) => ({ error: null, data: rows.slice(0, n) }),
                range: async (a, b) => ({ error: null, data: rows.slice(a, b + 1) }),
              }),
            }),
          }),
        }),
      }),
    };
    const L2 = loadBrowserScript('assets/js/lib.js', stubs).MinimsaahLib;
    const pager = L2.makePager('videos', 'published_at', 100, 0);
    assert.equal(pager.done(), false);
    const a = await pager.next();
    const b = await pager.next();
    assert.equal(a.length + b.length, 200);
    assert.equal(a[0].id, '0');
    assert.equal(b[0].id, '100');
    assert.equal(pager.done(), false);
    const c = await pager.next();
    assert.equal(c.length, 50);
    assert.equal(pager.done(), true);
    assert.deepEqual(await pager.next(), []);
  });

  it('makePager fails closed (errors end paging, rows stay)', async () => {
    const stubs = browserStubs();
    stubs.stubWindow.SupabaseDB = {
      isEnabled: () => true,
      client: () => ({ from: () => { throw new Error('down'); } }),
    };
    const L2 = loadBrowserScript('assets/js/lib.js', stubs).MinimsaahLib;
    const pager = L2.makePager('articles', 'published_at', 100, 100);
    assert.deepEqual(await pager.next(), []);
    assert.equal(pager.done(), true);
  });
});

// ---- 9. shared detail loader (Phase 4) ----
describe('MinimsaahLib detail loader', () => {
  function stubsWith(over) {
    const store = {};
    const stubWindow = Object.assign({ __API_BASE__: '' }, over && over.window);
    const stubLocation = Object.assign(
      { hostname: 'test', pathname: '/', search: '' }, over && over.location);
    const calls = [];
    const els = {};
    function el(id) {
      if (!els[id]) {
        els[id] = {
          id,
          classList: {
            add: (c) => calls.push([id, 'add', c]),
            remove: (c) => calls.push([id, 'remove', c]),
            toggle: () => {},
          },
          appendChild: (c) => calls.push([id, 'append', c && c.textContent]),
          textContent: '',
        };
      }
      return els[id];
    }
    const stubDocument = {
      getElementById: (id) => el(id),
      createElement: () => ({ style: {}, setAttribute() {}, className: '', textContent: '' }),
    };
    return {
      stubWindow, stubLocation, stubDocument, calls,
      stubLocalStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
    };
  }

  function loadLib(stubs, fetchImpl) {
    const src = fs.readFileSync(path.join(ROOT, 'assets/js/lib.js'), 'utf8');
    stubs.stubWindow.location = stubs.stubLocation;
    const fn = new Function('window', 'location', 'document', 'localStorage', 'fetch', 'navigator', src);
    fn(stubs.stubWindow, stubs.stubLocation, stubs.stubDocument, stubs.stubLocalStorage,
      fetchImpl || (() => { throw new Error('network disabled in tests'); }));
    return stubs.stubWindow.MinimsaahLib;
  }

  function supaStub(rows) {
    return {
      isEnabled: () => true,
      client: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => rows instanceof Error
                  ? { error: rows, data: null }
                  : { error: null, data: rows },
              }),
            }),
          }),
        }),
      }),
    };
  }

  it('getSlug reads ?slug=', () => {
    const s = stubsWith({ location: { search: '?slug=abc-1' } });
    assert.equal(loadLib(s).getSlug(), 'abc-1');
    const s2 = stubsWith({});
    assert.equal(loadLib(s2).getSlug(), null);
  });

  it('loadOne normalizes author and counts via POST /api/view', async () => {
    const posts = [];
    const s = stubsWith({
      location: { search: '?slug=x' },
      window: {
        SupabaseDB: supaStub(
          { id: '1', slug: 'x', first_name: 'A', author: { first_name: 'B', last_name: 'C' } }),
      },
    });
    const L = loadLib(s, async (url, opts) => {
      posts.push([url, opts]);
      return { ok: true, json: async () => ({ ok: true }) };
    });
    const row = await L.loadOne({
      table: 'articles', select: '*,author:users(first_name,last_name)',
      withAuthor: true, view: 'articles',
    });
    assert.equal(row.firstName, 'A');
    assert.equal(row.author.lastName, 'C');
    assert.equal(posts.length, 1);
    assert.equal(posts[0][0], '/api/view');
    assert.equal(posts[0][1].method, 'POST');
    assert.deepEqual(JSON.parse(posts[0][1].body), { table: 'articles', id: '1' });
  });

  it('countView throttles to one count per row per 5 minutes', async () => {
    const posts = [];
    const s = stubsWith({});
    const L = loadLib(s, async (url) => { posts.push(url); return { ok: true }; });
    await L.countView('videos', 'abc');
    await L.countView('videos', 'abc');
    assert.equal(posts.length, 1);
    assert.equal(posts[0], '/api/view');
    await L.countView('videos', 'other');
    assert.equal(posts.length, 2);
  });

  it('countView never throws and ignores bad input', async () => {
    const s = stubsWith({});
    const L = loadLib(s, async () => { throw new Error('down'); });
    await L.countView('articles', 'x');
    await L.countView('', '');
    await L.countView(null, null);
  });

  it('loadOne throws not found on miss and on missing slug', async () => {
    const s = stubsWith({
      location: { search: '?slug=gone' },
      window: { SupabaseDB: supaStub(new Error('no row')) },
    });
    await assert.rejects(loadLib(s).loadOne({ table: 'events' }), /not found/);
    const s2 = stubsWith({ window: { SupabaseDB: supaStub({}) } });
    await assert.rejects(loadLib(s2).loadOne({ table: 'events' }), /not found/);
  });

  it('loadOne throws without Supabase (no legacy fetch fallback)', async () => {
    const s = stubsWith({ location: { search: '?slug=y' } });
    s.stubWindow.SupabaseDB = { isEnabled: () => false };
    let fetched = false;
    const L = loadLib(s, async () => { fetched = true; return { ok: true, json: async () => ({}) }; });
    await assert.rejects(L.loadOne({ table: 'events' }), /not found/);
    assert.equal(fetched, false);
  });

  it('setPageState toggles the right nodes', () => {
    const s = stubsWith({});
    const L = loadLib(s);
    L.setPageState('content');
    assert.ok(s.calls.some((c) => c[0] === 'loading' && c[1] === 'add' && c[2] === 'hidden'));
    assert.ok(s.calls.some((c) => c[0] === 'content' && c[1] === 'remove'));
    s.calls.length = 0;
    L.setPageState('error');
    assert.ok(s.calls.some((c) => c[0] === 'error' && c[1] === 'remove'));
  });

  it('renderTags writes #-spans, bindShareCopy wires the button', () => {
    const s = stubsWith({});
    const L = loadLib(s);
    L.renderTags(['a', 'b']);
    assert.deepEqual(
      s.calls.filter((c) => c[1] === 'append').map((c) => c[2]),
      ['#a', '#b']);
    let wiredId = null;
    let wiredFn = null;
    const doc2 = {
      getElementById: (id) => {
        wiredId = id;
        return {
          innerHTML: '<iconify-icon></iconify-icon>',
          addEventListener: (ev, fn) => { if (ev === 'click') wiredFn = fn; },
        };
      },
      createElement: () => ({}),
    };
    const s2 = stubsWith({});
    s2.stubDocument = doc2;
    const ok = loadLib(s2).bindShareCopy();
    assert.equal(ok, true);
    assert.equal(wiredId, 'share-copy');
    assert.equal(typeof wiredFn, 'function');
  });

  it('bindShareCopy returns false when the button is missing', () => {
    const s = stubsWith({});
    s.stubDocument.getElementById = () => null;
    assert.equal(loadLib(s).bindShareCopy(), false);
  });

  it('show() ignores missing nodes, fmtDate returns input on bad date', () => {
    const s = stubsWith({});
    const L = loadLib(s);
    assert.doesNotThrow(() => L.show(null, true));
    assert.doesNotThrow(() => L.show({}, true));
    assert.equal(L.fmtDate('not-a-date'), 'not-a-date');
  });
});

// ---- 6. log-event door rejection paths (no network) ----
describe('api/log-event door', () => {
  let handler;
  before(async () => {
    ({ default: handler } = await import('../api/log-event.js'));
  });

  function mockRes() {
    const res = { statusCode: 0, body: null, headers: {}, ended: false };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => { res.ended = true; return res; };
    return res;
  }

  it('answers OPTIONS preflight with 204 + no-store', async () => {
    const res = mockRes();
    await handler({ method: 'OPTIONS', headers: {} }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('sets no-store on rejection paths', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, socket: {} }, res);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('returns 500 without server env', async () => {
    const keepUrl = process.env.SUPABASE_URL;
    const keepKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = mockRes();
      await handler({ method: 'POST', headers: {}, body: { event: 'nope' } }, res);
      assert.equal(res.statusCode, 500);
    } finally {
      if (keepUrl !== undefined) process.env.SUPABASE_URL = keepUrl;
      if (keepKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = keepKey;
    }
  });

  it('rejects bad event names with fixed words', async () => {
    process.env.SUPABASE_URL = 'https://dummy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key-for-tests';
    try {
      const res = mockRes();
      await handler({ method: 'POST', headers: {}, body: { event: 'nope' } }, res);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Bad request' });
    } finally {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it('rejects over-long email with fixed words', async () => {
    process.env.SUPABASE_URL = 'https://dummy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key-for-tests';
    try {
      const res = mockRes();
      await handler(
        { method: 'POST', headers: {}, body: { event: 'login_failed', email: 'a'.repeat(321) } },
        res
      );
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Bad request' });
    } finally {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it('rejects malformed email with fixed words', async () => {
    process.env.SUPABASE_URL = 'https://dummy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key-for-tests';
    try {
      const res = mockRes();
      await handler(
        { method: 'POST', headers: {}, body: { event: 'login_failed', email: 'not-an-email' } },
        res
      );
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Bad request' });
    } finally {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it('rejects control characters in detail', async () => {
    process.env.SUPABASE_URL = 'https://dummy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key-for-tests';
    try {
      const res = mockRes();
      await handler(
        { method: 'POST', headers: {}, body: { event: 'site_error', detail: 'bad\u0007char' } },
        res
      );
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Bad request' });
    } finally {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });
});

// ---- 6b. view-count door (no network; validation paths only) ----
describe('api/view door', () => {
  let viewHandler;
  before(async () => {
    ({ default: viewHandler } = await import('../api/view.js'));
  });

  function mockRes() {
    const res = { statusCode: 0, body: null, headers: {}, ended: false };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => { res.ended = true; return res; };
    return res;
  }

  function withEnv(fn) {
    process.env.SUPABASE_URL = 'https://dummy.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key-for-tests';
    return fn().finally(() => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });
  }

  it('answers OPTIONS preflight with 204 + no-store', async () => {
    const res = mockRes();
    await viewHandler({ method: 'OPTIONS', headers: {} }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('rejects non-POST with 405', async () => {
    const res = mockRes();
    await viewHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
  });

  it('returns 500 without server env', async () => {
    const keepUrl = process.env.SUPABASE_URL;
    const keepKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = mockRes();
      await viewHandler({ method: 'POST', headers: {}, body: { table: 'articles', id: 'x' } }, res);
      assert.equal(res.statusCode, 500);
    } finally {
      if (keepUrl !== undefined) process.env.SUPABASE_URL = keepUrl;
      if (keepKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = keepKey;
    }
  });

  it('rejects tables outside the allow-list', async () => {
    await withEnv(async () => {
      const res = mockRes();
      await viewHandler({ method: 'POST', headers: {}, body: { table: 'users', id: 'abc' } }, res);
      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: 'Bad request' });
    });
  });

  it('rejects malformed ids', async () => {
    await withEnv(async () => {
      for (const id of ['', 'a'.repeat(65), '../../etc', 'a;b', null]) {
        const res = mockRes();
        await viewHandler({ method: 'POST', headers: {}, body: { table: 'videos', id } }, res);
        assert.equal(res.statusCode, 400);
      }
    });
  });
});

// ---- 7. admin delete door rejection paths (no network) ----
describe('api/admin/delete door', () => {
  let delHandler;
  before(async () => {
    ({ default: delHandler } = await import('../api/admin/delete.js'));
  });

  function mockRes() {
    const res = { statusCode: 0, body: null, headers: {}, ended: false };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => { res.ended = true; return res; };
    return res;
  }

  it('rejects non-POST with 405', async () => {
    const res = mockRes();
    await delHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
  });

  it('answers OPTIONS preflight with 204 + no-store', async () => {
    const res = mockRes();
    await delHandler({ method: 'OPTIONS', headers: {} }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('rejects missing token with 401', async () => {
    const res = mockRes();
    await delHandler({ method: 'POST', headers: {}, body: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('returns 500 without server env', async () => {
    const keep = {
      url: process.env.SUPABASE_URL,
      anon: process.env.SUPABASE_ANON_KEY,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = mockRes();
      await delHandler(
        { method: 'POST', headers: { authorization: 'Bearer x' }, body: {} },
        res
      );
      assert.equal(res.statusCode, 500);
    } finally {
      if (keep.url !== undefined) process.env.SUPABASE_URL = keep.url;
      if (keep.anon !== undefined) process.env.SUPABASE_ANON_KEY = keep.anon;
      if (keep.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = keep.key;
    }
  });
});

// ---- 7b. upload-approve door (no network; validation paths only) ----
describe('api/upload-approve door', () => {
  let upHandler;
  before(async () => {
    ({ default: upHandler } = await import('../api/upload-approve.js'));
  });

  function mockRes() {
    const res = { statusCode: 0, body: null, headers: {}, ended: false };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => { res.ended = true; return res; };
    return res;
  }

  function withEnv(fn) {
    process.env.SUPABASE_URL = 'https://dummy.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'dummy-anon-for-tests';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key-for-tests';
    return fn().finally(() => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    });
  }

  it('answers OPTIONS preflight with 204 + no-store', async () => {
    const res = mockRes();
    await upHandler({ method: 'OPTIONS', headers: {} }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });

  it('rejects non-POST with 405', async () => {
    const res = mockRes();
    await upHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
  });

  it('rejects missing token with 401', async () => {
    const res = mockRes();
    await upHandler({ method: 'POST', headers: {}, body: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  });

  it('returns 500 without server env', async () => {
    const keep = {
      url: process.env.SUPABASE_URL,
      anon: process.env.SUPABASE_ANON_KEY,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const res = mockRes();
      await upHandler(
        { method: 'POST', headers: { authorization: 'Bearer x' }, body: {} },
        res
      );
      assert.equal(res.statusCode, 500);
    } finally {
      if (keep.url !== undefined) process.env.SUPABASE_URL = keep.url;
      if (keep.anon !== undefined) process.env.SUPABASE_ANON_KEY = keep.anon;
      if (keep.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = keep.key;
    }
  });

  it('upload validation: images', async () => {
    const { checkFile } = await import('../api/upload-approve.js');
    assert.equal(checkFile('image', 'photo.jpg', 'image/jpeg', 1000), '');
    assert.equal(checkFile('image', 'photo.JPG', 'image/jpeg', 8 * 1024 * 1024), '');
    assert.ok(checkFile('image', 'photo.jpg', 'image/jpeg', 8 * 1024 * 1024 + 1).includes('8 MB'));
    assert.ok(checkFile('image', 'photo.png', 'application/octet-stream', 100).includes('Only image'));
    assert.ok(checkFile('image', 'evil.svg', 'image/svg+xml', 100).includes('not allowed'));
  });

  it('upload validation: library (video 50 MB, docs, active content denied)', async () => {
    const { checkFile } = await import('../api/upload-approve.js');
    assert.equal(checkFile('library', 'clip.mp4', 'video/mp4', 50 * 1024 * 1024), '');
    assert.ok(checkFile('library', 'clip.mp4', 'video/mp4', 50 * 1024 * 1024 + 1).includes('50 MB'));
    assert.equal(checkFile('library', 'doc.pdf', 'application/pdf', 1000), '');
    assert.equal(checkFile('library', 'doc.docx', '', 1000), '');
    assert.ok(checkFile('library', 'run.sh', 'text/x-sh', 10).includes('not allowed'));
    assert.ok(checkFile('library', 'app.js', 'application/javascript', 10).includes('not allowed'));
    assert.ok(checkFile('library', 'x.mp4', 'video/mp4', 0).includes('Bad request'));
    assert.ok(checkFile('weird', 'x.jpg', 'image/jpeg', 10).includes('Bad request'));
  });

  it('upload caps parity: door mirrors admin/js/admin.js exactly', () => {
    const door = fs.readFileSync(path.join(ROOT, 'api/upload-approve.js'), 'utf8');
    const admin = fs.readFileSync(path.join(ROOT, 'admin/js/admin.js'), 'utf8');
    for (const lit of [
      "'.jpg'", "'.jpeg'", "'.png'", "'.gif'", "'.webp'", "'.avif'",
      "'.mp4'", "'.webm'", "'.mov'", "'.m4v'", "'.ogg'",
      "'.pdf'", "'.doc'", "'.docx'",
      "'.svg'", "'.html'", "'.php'", "'.exe'", "'.sh'", "'.ps1'",
      '8 * 1024 * 1024', '50 * 1024 * 1024',
    ]) {
      assert.ok(door.includes(lit), `door must contain ${lit}`);
      assert.ok(admin.includes(lit), `admin.js must contain ${lit}`);
    }
  });

  it('session-only identity: no localStorage fallback in privileged paths', () => {
    const admin = fs.readFileSync(path.join(ROOT, 'admin/js/admin.js'), 'utf8');
    assert.ok(!admin.includes('|| me.id'), 'author/uploader must come from the live session only');
    assert.ok(admin.includes('/api/upload-approve'), 'uploads must pass the approval door');
    assert.ok(admin.includes("addEventListener('storage'"), 'cross-tab logout sync must exist');
  });

  it('media rows bind uploader_id to the caller at the database', () => {
    const rls = fs.readFileSync(path.join(ROOT, 'supabase/rls.sql'), 'utf8');
    assert.ok(rls.includes('uploader_id = (auth.uid())::text'), 'staff_insert_media must bind uploader_id');
    const hardening = fs.readFileSync(path.join(ROOT, 'supabase/hardening.sql'), 'utf8');
    assert.ok(hardening.includes('MEDIA-INSERT-UNBOUND'), 'hardening must detect an unbound media insert');
    const audit = fs.readFileSync(path.join(ROOT, 'supabase/audit.sql'), 'utf8');
    assert.ok(audit.includes("'upload_approved'"), 'audit allow-list must admit approval rows');
  });
});

// ---- 10. drawer wiring (Phase 4) ----
describe('MinimsaahLib.wireDrawer', () => {
  function drawerStubs() {
    function mk() {
      const el = {
        classes: new Set(['hidden', 'opacity-0']),
        attrs: {},
        handlers: {},
        classList: {
          add(c) { this._s.add(c); },
          remove(c) { this._s.delete(c); },
          contains(c) { return this._s.has(c); },
          _s: null,
        },
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(ev, fn) { this.handlers[ev] = fn; },
        focus() { this.focused = true; },
        click() { if (this.handlers.click) this.handlers.click({ target: this }); },
      };
      return el;
    }
    function fin(s) {
      s.classList._s = s.classes;
      s.onclick = null;
      return s;
    }
    const t = fin(mk()), d = fin(mk()), c = fin(mk());
    const body = { style: {} };
    const docHandlers = {};
    const doc = {
      getElementById: (id) => (
        id === 'menu-toggle-detail' ? t
        : id === 'mobile-drawer-detail' ? d
        : id === 'menu-close-detail' ? c : null),
      body,
      addEventListener(ev, fn) { docHandlers[ev] = fn; },
      _handlers: docHandlers,
    };
    return { t, d, c, doc, body };
  }

  function loadLibWithDoc(doc) {
    const src = fs.readFileSync(path.join(ROOT, 'assets/js/lib.js'), 'utf8');
    const raf = (fn) => fn();
    const fn = new Function('window', 'location', 'document', 'localStorage', 'fetch', 'requestAnimationFrame', src);
    const win = {};
    fn(win, { hostname: 't', pathname: '/', search: '' }, doc,
      { getItem: () => null, setItem() {}, removeItem() {} },
      () => { throw new Error('network disabled in tests'); }, raf);
    return win.MinimsaahLib;
  }

  it('wires toggle open and close with aria updates', () => {
    const s = drawerStubs();
    const L = loadLibWithDoc(s.doc);
    assert.equal(L.wireDrawer(), true);
    s.t.click();
    assert.ok(!s.d.classes.has('hidden'));
    assert.equal(s.t.attrs['aria-expanded'], 'true');
    assert.equal(s.body.style.overflow, 'hidden');
    s.c.click();
    assert.ok(s.d.classes.has('opacity-0'));
    assert.equal(s.t.attrs['aria-expanded'], 'false');
    assert.equal(s.body.style.overflow, '');
  });

  it('closes on Escape', () => {
    const s = drawerStubs();
    loadLibWithDoc(s.doc).wireDrawer();
    s.t.click();
    assert.equal(s.t.attrs['aria-expanded'], 'true');
    s.doc._handlers.keydown({ key: 'Escape' });
    assert.equal(s.t.attrs['aria-expanded'], 'false');
  });

  it('returns false when nodes are missing', () => {
    const s = drawerStubs();
    s.doc.getElementById = () => null;
    assert.equal(loadLibWithDoc(s.doc).wireDrawer(), false);
  });
});
// ---- 12. accessibility pass (Phase 5) ----
describe('a11y: overlay buttons, labels, focus', () => {
  function libWith(stubs) {
    const src = fs.readFileSync(path.join(ROOT, 'assets/js/lib.js'), 'utf8');
    const fn = new Function('window', 'location', 'document', 'localStorage', 'fetch', src);
    fn(stubs.win, stubs.loc, stubs.doc, stubs.ls, () => { throw new Error('no network'); });
    return stubs.win.MinimsaahLib;
  }
  const base = () => ({
    win: {}, loc: { hostname: 't', pathname: '/', search: '' },
    doc: { getElementById: () => null },
    ls: { getItem: () => null, setItem() {}, removeItem() {} },
  });

  it('overlayHTML in-site variant is a labelled button', () => {
    const L = libWith(base());
    const h = L.overlayHTML({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'My <Film>' });
    assert.ok(h.startsWith('<div class="absolute inset-0'));
    assert.ok(h.includes('<button type="button"'));
    assert.ok(h.includes('aria-label="Play My &lt;Film&gt;"'));
    assert.ok(h.includes('data-video-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"'));
    assert.ok(!h.includes('<b>') && !h.includes('<Film>'));
  });

  it('overlayHTML go-out variant stays a plain marker', () => {
    const L = libWith(base());
    const h = L.overlayHTML({ videoUrl: 'https://t.test/v/1', title: 'T', goOut: true });
    assert.ok(!h.includes('<button'));
    assert.ok(h.includes('Watch on provider'));
  });

  it('overlayHTML renders nothing without a video', () => {
    const L = libWith(base());
    assert.equal(L.overlayHTML({ title: 'T' }), '');
  });

  it('labelPlay sets a capped spoken label', () => {
    const L = libWith(base());
    let got = '';
    L.labelPlay({ setAttribute: (k, v) => { got = k + '=' + v; } }, 'A'.repeat(200));
    assert.ok(got.startsWith('aria-label=Play '));
    assert.ok(got.length < 130);
    assert.doesNotThrow(() => L.labelPlay(null, 'x'));
  });

  it('static pages carry live regions and labelled controls', () => {
    const need = {
      'videos.html': ['role="status"', 'aria-live="polite"'],
      'documentaries.html': ['role="status"', 'aria-live="polite"'],
      'articles.html': ['role="status"', 'aria-live="polite"'],
      'article.html': ['role="status"', 'aria-live="polite"', 'aria-label="Copy link"'],
      'video.html': ['role="status"', 'aria-live="polite"', 'aria-label="Copy link"'],
      'event.html': ['role="status"'],
      'documentary.html': ['role="status"'],
      'index.html': ['aria-label="Play video"', 'aria-label="Play documentary"'],
    };
    for (const [f, marks] of Object.entries(need)) {
      const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of marks) assert.ok(t.includes(m), `${f} must contain ${m}`);
    }
  });
});

// ---- 13. player focus restore (Phase 5) ----
describe('MinimsaahPlayer focus', () => {
  function playerStubs() {
    function mk() {
      return {
        style: {}, innerHTML: '', textContent: '',
        dataset: {},
        kids: {},
        handlers: {},
        setAttribute() {},
        addEventListener(ev, fn) { this.handlers[ev] = fn; },
        appendChild(c) { this.appended = c; },
        querySelector(sel) { return this.kids[sel] || null; },
        removeAttribute() {},
        focus() { this.focused = true; },
      };
    }
    const modal = mk();
    ['#video-modal-close', '#video-modal-body', '#video-modal-blocked',
     '#video-modal-poster', '#video-modal-thumb', '#video-modal-retry',
     '#video-modal-watch'].forEach((s) => { modal.kids[s] = mk(); });
    modal.firstElementChild = mk();
    const opener = mk();
    const doc = {
      createElement: () => modal,
      body: { appendChild() {}, style: {} },
      activeElement: opener,
      addEventListener() {},
    };
    const win = {
      MinimsaahEmbeds: {
        thumbnailUrl: () => 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        toEmbedUrl: (v) => v,
        isAllowedEmbedUrl: () => true,
        isNativeMedia: () => false,
        detectProvider: () => 'youtube',
        createIframe: () => mk(),
      },
    };
    return { modal, opener, doc, win };
  }

  function loadPlayer(stubs) {
    const src = fs.readFileSync(path.join(ROOT, 'assets/js/player.js'), 'utf8');
    const fn = new Function('window', 'document', 'setTimeout', src);
    fn(stubs.win, stubs.doc, (f) => f());
    return stubs.win.MinimsaahPlayer;
  }

  it('close() gives focus back to the opener', () => {
    const s = playerStubs();
    // modal starts "created" so open() reuses our fake
    s.doc.createElement = () => s.modal;
    const P = loadPlayer(s);
    P.open({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'T' });
    P.close();
    assert.equal(s.opener.focused, true);
  });
});
// ---- 11. chat widget self-build (Phase 4) ----
describe('MinimsaahContact widget', () => {
  function fakeEl(id) {
    return {
      id,
      dataset: {},
      style: {},
      textContent: '',
      value: '',
      handlers: {},
      classList: {
        toggle() {}, add() {}, remove() {},
        contains: () => false,
      },
      setAttribute() {},
      addEventListener(ev, fn) { this.handlers[ev] = fn; },
      appendChild() {},
      focus() {},
    };
  }

  function widgetStubs() {
    const registry = {};
    const el = (id) => (registry[id] || (registry[id] = fakeEl(id)));
    let injected = '';
    const doc = {
      readyState: 'complete',
      getElementById: (id) => registry[id] || null,
      createElement: () => fakeEl(''),
      head: { appendChild() {} },
      body: {
        appendChild() {},
        insertAdjacentHTML(pos, html) { injected += html; },
      },
      addEventListener() {},
    };
    return { registry, el, doc, getInjected: () => injected };
  }

  function loadWidget(stubs) {
    const src = fs.readFileSync(path.join(ROOT, 'assets/js/contact.js'), 'utf8');
    const fn = new Function('window', 'location', 'document', 'localStorage', 'fetch', src);
    const win = { SupabaseDB: null };
    const loc = { hostname: 'test', pathname: '/', search: '' };
    const store = {};
    const ls = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    fn(win, loc, stubs.doc, ls, () => { throw new Error('network disabled in tests'); });
    return win.MinimsaahContact;
  }

  it('injects identical widget markup when the page has none', () => {
    const stubs = widgetStubs();
    loadWidget(stubs);
    const html = stubs.getInjected();
    assert.ok(html.includes('id="contact-fab"'));
    assert.ok(html.includes('id="contact-panel"'));
    assert.ok(html.includes('id="contact-form"'));
    assert.ok(html.includes('Chat with MINIMSAAH'));
  });

  it('skips injection when the page already carries the widget', () => {
    const stubs = widgetStubs();
    ['contact-fab', 'contact-panel', 'contact-close', 'contact-done-close',
     'contact-form-view', 'contact-done-view', 'contact-name', 'contact-email',
     'contact-msg', 'contact-count', 'contact-err', 'contact-send',
     'contact-form'].forEach((id) => stubs.el(id));
    loadWidget(stubs);
    assert.equal(stubs.getInjected(), '');
  });

  it('blocks empty name with friendly words', () => {
    const stubs = widgetStubs();
    ['contact-fab', 'contact-panel', 'contact-close', 'contact-done-close',
     'contact-form-view', 'contact-done-view', 'contact-name', 'contact-email',
     'contact-msg', 'contact-count', 'contact-err', 'contact-send',
     'contact-form'].forEach((id) => stubs.el(id));
    stubs.el('contact-msg').value = 'Hello there, this is long enough.';
    stubs.el('contact-email').value = 'a@b.co';
    loadWidget(stubs);
    const form = stubs.el('contact-form');
    assert.ok(form.handlers.submit, 'submit wired');
    form.handlers.submit({ preventDefault() {} });
    assert.equal(stubs.el('contact-err').textContent, 'Your name is needed.');
  });

  it('blocks bad email with friendly words', () => {
    const stubs = widgetStubs();
    ['contact-fab', 'contact-panel', 'contact-close', 'contact-done-close',
     'contact-form-view', 'contact-done-view', 'contact-name', 'contact-email',
     'contact-msg', 'contact-count', 'contact-err', 'contact-send',
     'contact-form'].forEach((id) => stubs.el(id));
    stubs.el('contact-name').value = 'Ada';
    stubs.el('contact-email').value = 'not-an-email';
    stubs.el('contact-msg').value = 'Hello there, this is long enough.';
    loadWidget(stubs);
    stubs.el('contact-form').handlers.submit({ preventDefault() {} });
    assert.equal(stubs.el('contact-err').textContent, 'Email must look like name@site.');
  });
});

// ---- 14. P0-CSP static guards: headers must cover what the code fetches ----
describe('headers/CSP static guards', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

  function cspFor(source) {
    const b = vercel.headers.find((h) => h.source === source);
    const h = b.headers.find((x) => x.key === 'Content-Security-Policy');
    return h.value;
  }

  it('public connect-src covers Supabase, iconify, and TikTok oEmbed', () => {
    const csp = cspFor('/(.*)');
    assert.ok(csp.includes('https://*.supabase.co'), 'supabase wildcard');
    assert.ok(csp.includes('https://api.iconify.design'), 'iconify runtime');
    assert.ok(csp.includes('https://www.tiktok.com'), 'tiktok oembed (embeds.js fetch)');
  });

  it('admin connect-src covers TikTok and iconify', () => {
    const csp = cspFor('/admin/(.*)');
    assert.ok(csp.includes('https://www.tiktok.com'));
    assert.ok(csp.includes('https://api.iconify.design'));
  });

  it('drops deprecated X-XSS-Protection, keeps COOP + no-frame', () => {
    const top = vercel.headers.find((h) => h.source === '/(.*)').headers;
    const keys = top.map((h) => h.key);
    assert.ok(!keys.includes('X-XSS-Protection'), 'deprecated header removed');
    assert.ok(keys.includes('Cross-Origin-Opener-Policy'));
    assert.ok(cspFor('/(.*)').includes("frame-ancestors 'none'"));
  });

  it('api routes answer preflight via headers config', () => {
    const api = vercel.headers.find((h) => h.source === '/api/(.*)').headers;
    const m = Object.fromEntries(api.map((h) => [h.key, h.value]));
    assert.ok(m['Access-Control-Allow-Methods'].includes('OPTIONS'));
    assert.ok(m['Access-Control-Allow-Headers'].includes('Authorization'));
    assert.equal(m.Vary, 'Origin');
  });

  it('pre-rendered story dirs carry edge cache (browser always fresh)', () => {
    // max-age=0: readers revalidate (fresh). s-maxage=60: edge absorbs
    // traffic spikes. stale-while-revalidate: no request ever waits.
    // New publishes land within ~60s; deploys regenerate the files anyway.
    for (const src of ['/article/(.*)', '/video/(.*)', '/documentary/(.*)', '/event/(.*)']) {
      const b = vercel.headers.find((h) => h.source === src);
      assert.ok(b, `missing headers block for ${src}`);
      const cc = b.headers.find((h) => h.key === 'Cache-Control').value;
      assert.ok(cc.includes('max-age=0'), `${src} must not let browsers cache`);
      assert.ok(cc.includes('s-maxage=60'), `${src} must cache at the edge`);
      assert.ok(cc.includes('stale-while-revalidate'), `${src} must never make readers wait`);
    }
  });
});

// ---- 15. P1-RLS static guards: policies carry WITH CHECK + triggers + indexes ----
describe('supabase RLS static guards', () => {
  const rls = fs.readFileSync(path.join(ROOT, 'supabase/rls.sql'), 'utf8');
  const hardening = fs.readFileSync(path.join(ROOT, 'supabase/hardening.sql'), 'utf8');
  const audit = fs.readFileSync(path.join(ROOT, 'supabase/audit.sql'), 'utf8');

  it('staff UPDATE policies carry WITH CHECK', () => {
    for (const t of ['articles', 'videos', 'documentaries', 'events']) {
      const re = new RegExp(
        `create policy "staff_update" on public\\.${t} for update using \\(public\\.is_staff\\(\\)\\) with check \\(public\\.is_staff\\(\\)\\)`
      );
      assert.ok(re.test(rls), `${t} staff_update needs WITH CHECK`);
    }
  });

  it('updated_at trigger function + per-table triggers exist', () => {
    assert.ok(rls.includes('create or replace function public.handle_updated_at()'));
    for (const t of ['articles', 'videos', 'documentaries', 'events', 'tickers', 'sponsors']) {
      assert.ok(rls.includes(`create trigger set_updated_at before update on public.${t}`), t);
    }
  });

  it('audit throttle indexes exist', () => {
    assert.ok(audit.includes('admin_audit_created_at_idx'));
    assert.ok(audit.includes('admin_audit_email_created_idx'));
  });

  it('hardening checks open-write normalization, WITH CHECK, and triggers', () => {
    assert.ok(hardening.includes('UPDATE-WITHOUT-WITHCHECK'));
    assert.ok(hardening.includes('lock_user_role'));
    assert.ok(hardening.includes('set_updated_at'));
    assert.ok(hardening.includes('regexp_replace'));
  });

  it('increment_view is revoked from anon/authenticated (door-only counts)', () => {
    // PUBLIC must be named: Postgres grants new functions to PUBLIC by
    // default, which covers everyone even after named roles are revoked.
    // Missing PUBLIC once caused a live HARDENING GAPS: RPC-OPEN failure.
    assert.ok(
      rls.includes('revoke execute on function public.increment_view(text, text) from public, anon, authenticated;'),
      'rls.sql must revoke direct RPC access including PUBLIC'
    );
    assert.ok(
      audit.includes('revoke execute on function public.increment_view(text, text) from public, anon, authenticated;'),
      'audit.sql re-asserts the revoke after its redefine'
    );
    assert.ok(hardening.includes('RPC-OPEN:increment_view'), 'hardening must detect an open RPC');
  });

  it('browser counts through POST /api/view, never the RPC', () => {
    const lib = fs.readFileSync(path.join(ROOT, 'assets/js/lib.js'), 'utf8');
    assert.ok(lib.includes("fetch('/api/view'"), 'loadOne must count via the door');
    assert.ok(!lib.includes('increment_view'), 'no direct RPC reference may remain in lib.js');
  });
});

// ---- 16. P5 sitemap hygiene: env SITE + test-fixture exclusion ----
describe('sitemap build hygiene', () => {
  it('SITE honors SITE_URL env with production fallback', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/sitemap.js'), 'utf8');
    assert.ok(src.includes('process.env.SITE_URL'));
    assert.ok(src.includes('https://minimsaah.vercel.app'));
  });

  it('skips test- slugs and reports the skip', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/sitemap.js'), 'utf8');
    assert.ok(src.includes('/^test-/i.test(slug)'));
    assert.ok(src.includes('skippedTest'));
  });

  it('getJSON has a timeout so builds never hang', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/sitemap.js'), 'utf8');
    assert.ok(src.includes('timeout'));
    assert.ok(src.includes('15000'));
  });

  it('pages past 1000 with a stable order and a runaway cap', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/sitemap.js'), 'utf8');
    assert.ok(src.includes('&offset='));
    assert.ok(src.includes('page.length < 1000'));
    assert.ok(src.includes('offset >= 9000'));
  });

  it('list pages page through makePager behind a Load-more button', () => {
    for (const f of ['articles.html', 'videos.html', 'documentaries.html']) {
      const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(t.includes('makePager('), `${f} must page via MinimsaahLib.makePager`);
      assert.ok(t.includes('id="more"'), `${f} must carry the Load-more button`);
      assert.ok(t.includes('loadMore'), `${f} must wire the button`);
    }
  });
});

// ---- 17. Tailwind compiled-CSS guards: no Play CDN, CSS built, CSP clean ----
describe('tailwind compiled-CSS guards', () => {
  const htmlFiles = [
    ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
    ...fs.readdirSync(path.join(ROOT, 'admin')).filter((f) => f.endsWith('.html')).map((f) => `admin/${f}`),
  ];

  it('no tracked HTML references the Play CDN', () => {
    const hits = htmlFiles.filter((rel) => {
      try {
        return fs.readFileSync(path.join(ROOT, rel), 'utf8').includes('cdn.tailwindcss.com');
      } catch (e) { return false; }
    });
    assert.deepEqual(hits, []);
  });

  it('every tracked HTML links the compiled stylesheet', () => {
    const missing = htmlFiles.filter((rel) => {
      try {
        return !fs.readFileSync(path.join(ROOT, rel), 'utf8').includes('/assets/css/tailwind.css');
      } catch (e) { return true; }
    });
    assert.deepEqual(missing, []);
  });

  it('compiled CSS exists and carries brand tokens + utilities', () => {
    const css = fs.readFileSync(path.join(ROOT, 'assets/css/tailwind.css'), 'utf8');
    assert.ok(css.length > 10000, `tailwind.css suspiciously small (${css.length}b) — rebuild needed`);
    for (const k of ['050505', 'E63946', 'backdrop-blur', 'inset-0', 'sr-only']) {
      assert.ok(css.includes(k), `tailwind.css missing ${k}`);
    }
  });

  it('CSP no longer lists the Tailwind CDN', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    for (const b of vercel.headers) {
      for (const h of b.headers || []) {
        if (h.key === 'Content-Security-Policy') {
          assert.ok(!h.value.includes('cdn.tailwindcss.com'), `${b.source} CSP still allows Tailwind CDN`);
        }
      }
    }
  });

  it('build pipeline compiles CSS before inject + sitemap', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    assert.ok(String(pkg.scripts['build:css']).includes('tailwindcss'));
    assert.ok(String(pkg.scripts.build).includes('build:css'));
    assert.ok(String(vercel.buildCommand).includes('tailwindcss'));
  });
});

// ---- 18. Backup script safety: never writes to PROD, secrets never print ----
describe('backup-restore safety guards', () => {
  const br = require('../scripts/backup-restore.js');
  // NOTE: test URLs are built by concat so the literal `scheme://user:pass@`
  // pattern never appears in tracked source (audit-secrets stays strict).
  const U = (host, pw) => 'postgres://u:' + pw + '@' + host + '/postgres';

  it('masks passwords in logs', () => {
    const out = br.maskUrl(U('db.example.com:5432', 's3cret'));
    assert.ok(!out.includes('s3cret'));
    assert.ok(out.includes('***'));
    assert.ok(out.includes('db.example.com'));
  });

  it('refuses when TEST url is missing', () => {
    const g = br.guardWrite(U('prod.db:5432', 'p'), '', 'test');
    assert.equal(g.ok, false);
  });

  it('refuses when TEST equals PROD (even with different password)', () => {
    const g = br.guardWrite(
      U('db.ref.supabase.co:5432', 'p1'),
      U('db.ref.supabase.co:5432', 'p2'),
      'test'
    );
    assert.equal(g.ok, false);
  });

  it('refuses when TEST url lacks the tag', () => {
    const g = br.guardWrite(
      U('db.live123.supabase.co:5432', 'p'),
      U('db.other456.supabase.co:5432', 'p'),
      'restore-test'
    );
    assert.equal(g.ok, false);
  });

  it('allows a clearly separate tagged TEST target', () => {
    const g = br.guardWrite(
      U('db.live123.supabase.co:5432', 'p'),
      U('db.restore-test-789.supabase.co:5432', 'p'),
      'restore-test'
    );
    assert.equal(g.ok, true);
  });

  it('covers the content tables', () => {
    assert.deepEqual(br.TABLES, ['articles', 'videos', 'documentaries', 'events', 'tickers', 'media']);
  });
});

// ---- 19. CLS hygiene: every lazy image carries width + height ----
describe('lazy-image dimensions', () => {
  function trackedFiles(ext, dir) {
    const out = [];
    const root = dir || ROOT;
    for (const f of fs.readdirSync(root)) {
      if (f === 'node_modules' || f === '.git') continue;
      const p = path.join(root, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) out.push(...trackedFiles(ext, p));
      else if (f.endsWith(ext)) out.push(p);
    }
    return out;
  }

  it('no lazy image lacks width/height (static HTML + injected markup)', () => {
    const files = [
      ...trackedFiles('.html'),
      ...trackedFiles('.js', path.join(ROOT, 'assets', 'js')),
      ...trackedFiles('.js', path.join(ROOT, 'admin', 'js')),
    ];
    const bad = [];
    for (const p of files) {
      const t = fs.readFileSync(p, 'utf8');
      const re = /<img\b[^>]*loading="lazy"[^>]*>/g;
      let m;
      while ((m = re.exec(t))) {
        if (!/\bwidth="/.test(m[0]) || !/\bheight="/.test(m[0])) {
          bad.push(`${path.relative(ROOT, p)}: ${m[0].slice(0, 100)}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});

// ---- 20. Head partial: one source of truth, no pasted copies ----
describe('head-core partial', () => {
  const bh = require('../scripts/build-head.js');

  it('partial exists and holds the tailwind link', () => {
    const p = fs.readFileSync(path.join(ROOT, 'partials/head-core.html'), 'utf8');
    assert.ok(p.includes('/assets/css/tailwind.css'));
    assert.ok(p.includes('fonts.googleapis.com'));
  });

  it('every tracked HTML carries the exact partial block', () => {
    const bad = [];
    for (const rel of bh.htmlFiles()) {
      const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const nl = t.includes('\r\n') ? '\r\n' : '\n';
      if (!t.includes(bh.renderPartial(nl))) bad.push(rel);
    }
    assert.deepEqual(bad, []);
  });

  it('no stale admin-only font URL survives anywhere', () => {
    const stale = 'family=Inter:wght@400;500&family=Space';
    const hits = [];
    for (const rel of bh.htmlFiles()) {
      const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (t.includes(stale)) hits.push(rel);
    }
    assert.deepEqual(hits, []);
  });

  it('build pipeline stamps the partial before env injection', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    for (const cmd of [String(pkg.scripts.build), String(vercel.buildCommand)]) {
      const hi = cmd.indexOf('build-head');
      const ii = cmd.indexOf('inject-env');
      assert.ok(hi !== -1 && ii !== -1 && hi < ii, `head partial must run before inject-env: ${cmd}`);
    }
  });
});

// ---- reduced-motion CSS placement: carousel kill-rules stay scoped ----
describe('reduced-motion CSS placement guard', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  function reducedBlockEnd(text) {
    const start = text.indexOf('@media (prefers-reduced-motion: reduce) {');
    if (start === -1) return -1;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  it('.sponsor-track animation kill-rule sits inside the reduced-motion block', () => {
    const end = reducedBlockEnd(html);
    assert.ok(end !== -1, 'reduced-motion block exists and closes');
    const block = html.slice(html.indexOf('@media (prefers-reduced-motion: reduce) {'), end + 1);
    assert.ok(
      /\.sponsor-track\s*\{[^}]*animation:\s*none/.test(block),
      'kill-rule must be scoped to reduced-motion users only'
    );
  });

  it('no unconditional .sponsor-track animation:none outside the block', () => {
    const end = reducedBlockEnd(html);
    const after = end === -1 ? html : html.slice(end + 1);
    const stray = /\.sponsor-track\s*\{[^}]*animation:\s*none/.exec(after);
    assert.ok(!stray, `top-level kill-rule found outside reduced-motion: ${stray && stray[0]}`);
  });

  it('partners strip keeps its scroll animation for normal visitors', () => {
    const strip = html.slice(html.indexOf('/* ===== Partners strip ===== */'));
    assert.ok(
      /\.sponsor-track\s*\{[\s\S]*?animation:\s*sponsor-scroll/.test(strip),
      'scroll animation must stay active'
    );
    assert.ok(strip.includes('@keyframes sponsor-scroll'), 'keyframes defined');
  });
});

// ---- 21. Phase 1: the staff access decision (pure function, exhaustive) ----
describe('phase 1 staff access decision', () => {
  let staffDecision;
  before(async () => {
    ({ staffDecision } = await import('../api/lib/staffAccess.js'));
  });

  const STAFF = ['OWNER', 'EDITOR', 'JOURNALIST', 'VIDEOGRAPHER'];
  const profile = (role, status) => ({ role, status });

  it('allows every staff role on its own door allowlist', () => {
    for (const role of STAFF) {
      const d = staffDecision(profile(role, 'ACTIVE'), STAFF);
      assert.equal(d.allowed, true, role);
      assert.equal(d.reason, 'ok');
    }
  });

  it('OWNER and EDITOR pass the delete-door allowlist', () => {
    assert.equal(staffDecision(profile('OWNER', 'ACTIVE'), ['OWNER', 'EDITOR']).allowed, true);
    assert.equal(staffDecision(profile('EDITOR', 'ACTIVE'), ['OWNER', 'EDITOR']).allowed, true);
  });

  it('JOURNALIST and VIDEOGRAPHER are refused on the delete door', () => {
    assert.equal(staffDecision(profile('JOURNALIST', 'ACTIVE'), ['OWNER', 'EDITOR']).reason, 'role');
    assert.equal(staffDecision(profile('VIDEOGRAPHER', 'ACTIVE'), ['OWNER', 'EDITOR']).reason, 'role');
  });

  it('missing or broken profiles fail closed', () => {
    assert.equal(staffDecision(null, STAFF).reason, 'no-profile');
    assert.equal(staffDecision(undefined, STAFF).reason, 'no-profile');
    assert.equal(staffDecision('nope', STAFF).reason, 'no-profile');
    assert.equal(staffDecision([1, 2], STAFF).reason, 'no-profile');
  });

  it('blank or broken status fails closed (only explicit ACTIVE passes)', () => {
    assert.equal(staffDecision(profile('OWNER', ''), STAFF).reason, 'no-status');
    assert.equal(staffDecision(profile('OWNER', null), STAFF).reason, 'no-status');
    assert.equal(staffDecision(profile('OWNER', undefined), STAFF).reason, 'no-status');
    assert.equal(staffDecision(profile('OWNER', 5), STAFF).reason, 'no-status');
  });

  it('suspended and inactive accounts are refused', () => {
    assert.equal(staffDecision(profile('OWNER', 'SUSPENDED'), STAFF).reason, 'suspended');
    assert.equal(staffDecision(profile('EDITOR', 'INACTIVE'), STAFF).reason, 'suspended');
    assert.equal(staffDecision(profile('OWNER', 'SUSPENDED'), STAFF).allowed, false);
  });

  it('blank or non-string roles are refused', () => {
    assert.equal(staffDecision(profile('', 'ACTIVE'), STAFF).reason, 'no-role');
    assert.equal(staffDecision(profile(null, 'ACTIVE'), STAFF).reason, 'no-role');
    assert.equal(staffDecision(profile({}, 'ACTIVE'), STAFF).reason, 'no-role');
    assert.equal(staffDecision(profile(5, 'ACTIVE'), STAFF).reason, 'no-role');
  });

  it('SUBSCRIBER and unknown roles are refused', () => {
    assert.equal(staffDecision(profile('SUBSCRIBER', 'ACTIVE'), STAFF).reason, 'role');
    assert.equal(staffDecision(profile('SUPERADMIN', 'ACTIVE'), STAFF).reason, 'role');
  });

  it('role matching is exact (no case or space forgiveness)', () => {
    assert.equal(staffDecision(profile('owner', 'ACTIVE'), STAFF).reason, 'role');
    assert.equal(staffDecision(profile(' OWNER', 'ACTIVE'), STAFF).reason, 'role');
  });

  it('non-array allowlists deny everything (fail closed)', () => {
    assert.equal(staffDecision(profile('OWNER', 'ACTIVE'), undefined).allowed, false);
    assert.equal(staffDecision(profile('OWNER', 'ACTIVE'), null).allowed, false);
    assert.equal(staffDecision(profile('OWNER', 'ACTIVE'), 'OWNER').allowed, false);
  });

  it('a self-written metadata claim inside the profile object never helps', () => {
    const p = { role: 'EDITOR', status: 'ACTIVE', user_metadata: { role: 'OWNER' } };
    assert.equal(staffDecision(p, STAFF).allowed, true); // real role used
    const q = { role: 'JOURNALIST', status: 'ACTIVE', user_metadata: { role: 'OWNER' } };
    assert.equal(staffDecision(q, ['OWNER', 'EDITOR']).allowed, false); // and only it
  });
});

// ---- 22. Phase 1 static guards: doors + SQL stay fail-closed forever ----
describe('phase 1 doors and SQL guards', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const DELETE = read('api/admin/delete.js');
  const UPLOAD = read('api/upload-approve.js');
  const RLS = read('supabase/rls.sql');
  const AUDIT = read('supabase/audit.sql');
  const P1 = read('supabase/phase1_hardening.sql');

  function helperBlock(sql, name) {
    const start = sql.indexOf('create or replace function public.' + name + '()');
    if (start === -1) return '';
    const end = sql.indexOf('$$;', start);
    return end === -1 ? '' : sql.slice(start, end + 3);
  }

  it('delete door: DB profile only, no metadata fallback, no swallow-read', () => {
    assert.ok(!DELETE.includes('user.user_metadata'), 'metadata fallback must be gone');
    assert.ok(!DELETE.includes('.single('), 'profile read must not be .single() (swallows 0 rows)');
    assert.ok(DELETE.includes('staffDecision'), 'shared decision in use');
    assert.ok(DELETE.includes('maybeSingle'), 'missing row must be visible, not an exception');
    assert.ok(DELETE.includes("../lib/staffAccess.js"), 'imports the shared module');
    assert.ok(DELETE.includes("'no-status'") || DELETE.includes("decision.reason === 'suspended'"), 'suspension has its own audit outcome');
  });

  it('upload door: DB profile only, no metadata fallback, no swallow-read', () => {
    assert.ok(!UPLOAD.includes('user.user_metadata'), 'metadata fallback must be gone');
    assert.ok(!UPLOAD.includes('.single('), 'profile read must not be .single()');
    assert.ok(UPLOAD.includes('staffDecision'), 'shared decision in use');
    assert.ok(UPLOAD.includes('maybeSingle'), 'missing row must be visible');
    assert.ok(UPLOAD.includes("./lib/staffAccess.js"), 'imports the shared module');
    assert.ok(UPLOAD.includes("'JOURNALIST'") && UPLOAD.includes("'VIDEOGRAPHER'"), 'all four staff roles allowed on this door');
  });

  it('staffAccess is a pure function: no network, no clients', () => {
    const src = read('api/lib/staffAccess.js');
    assert.ok(!src.includes('@supabase/supabase-js'), 'no client import');
    assert.ok(!src.includes('fetch('), 'no network');
    assert.ok(src.includes('export function staffDecision'), 'exports the decision');
  });

  it('rls.sql helpers read the database, require ACTIVE, are definer+pinned', () => {
    for (const name of ['is_staff', 'is_owner_editor']) {
      const b = helperBlock(RLS, name);
      assert.ok(b, name + ' exists');
      assert.ok(b.includes('security definer'), name + ' is SECURITY DEFINER');
      assert.ok(b.includes('set search_path = public'), name + ' pins search_path');
      assert.ok(b.includes('from public.users'), name + ' reads the database row');
      assert.ok(b.includes('auth.uid()::text'), name + ' keys on the verified session id');
      assert.ok(b.includes("u.status::text = 'ACTIVE'"), name + ' requires ACTIVE status');
      assert.ok(!b.includes('user_metadata'), name + ' never reads metadata');
    }
  });

  it('rls.sql: zero user_metadata accessors anywhere', () => {
    assert.ok(!/auth\.jwt\(\)\s*->\s*'user_metadata'/.test(RLS), 'no policy may trust self-writable metadata');
    assert.ok(!RLS.includes("'user_metadata' ->> 'role'"), 'old accessor gone');
  });

  it('rls.sql: role lock OWNER check comes from the database row', () => {
    assert.ok(
      RLS.includes("where u.id = auth.uid()::text and u.role::text = 'OWNER' and u.status::text = 'ACTIVE'"),
      'lock_user_role must consult the DB row'
    );
  });

  it('rls.sql: all four content inserts are bound to the author', () => {
    const re = /create policy "staff_insert" on public\.(articles|videos|documentaries|events) for insert\s*with check \(public\.is_staff\(\) and author_id = \(auth\.uid\(\)\)::text\);/g;
    const tables = [...RLS.matchAll(re)].map((m) => m[1]);
    assert.deepEqual(tables.sort(), ['articles', 'documentaries', 'events', 'videos']);
  });

  it('rls.sql: author_id immutability trigger covers all four tables', () => {
    assert.ok(RLS.includes('create or replace function public.protect_author_id()'), 'trigger function defined');
    const re = /create trigger protect_author_id before update on public\.(articles|videos|documentaries|events)/g;
    const tables = [...RLS.matchAll(re)].map((m) => m[1]);
    assert.deepEqual(tables.sort(), ['articles', 'documentaries', 'events', 'videos']);
  });

  it('audit.sql: audit reads are boss-only', () => {
    assert.ok(
      /create policy "staff_read_audit" on public\.admin_audit for select using \(public\.is_owner_editor\(\)\);/.test(AUDIT),
      'read policy must use is_owner_editor'
    );
    assert.ok(!/staff_read_audit" on public\.admin_audit for select using \(public\.is_staff\(\)\)/.test(AUDIT), 'old all-staff read gone');
  });

  it('phase1_hardening.sql: delta carries the whole fix, backfill stays conservative', () => {
    const b = helperBlock(P1, 'is_staff');
    assert.ok(b.includes('security definer') && b.includes('from public.users'), 'delta helper reads the DB');
    assert.ok(P1.includes('SUBSCRIBER'), 'backfill must never auto-promote (SUBSCRIBER default)');
    const re = /create trigger protect_author_id before update on public\.(articles|videos|documentaries|events)/g;
    assert.equal([...P1.matchAll(re)].length, 4, 'all four triggers in the delta');
    const rei = /with check \(public\.is_staff\(\) and author_id = \(auth\.uid\(\)\)::text\);/g;
    assert.equal([...P1.matchAll(rei)].length, 4, 'all four bound inserts in the delta');
    assert.ok(P1.includes("select using (public.is_owner_editor())"), 'boss-only audit read in the delta');
    assert.ok(P1.includes("u.role::text = 'OWNER' and u.status::text = 'ACTIVE'"), 'DB-row OWNER check in the delta');
  });

  it('phase1_hardening.sql: reads the real auth metadata column', () => {
    assert.ok(P1.includes("a.raw_user_meta_data ->> 'role'"), 'pre-flight must use the real auth.users column');
    assert.ok(P1.includes("a.raw_user_meta_data ->> 'firstName'"), 'backfill must use the real auth.users column');
    assert.ok(!P1.includes('a.user_metadata'), 'a.user_metadata does not exist on the auth.users table');
  });
});

// ---- 23. Phase 2: audit identity resolution (pure function, exhaustive) ----
describe('phase 2 audit identity', () => {
  let auditIdentity, eventRequiresVerifiedToken;
  before(async () => {
    ({ auditIdentity, eventRequiresVerifiedToken } = await import('../api/lib/auditIdentity.js'));
  });

  it('only login_success requires a verified token', () => {
    assert.equal(eventRequiresVerifiedToken('login_success'), true);
    for (const ev of ['login_failed', 'login_denied', 'guard_denied', 'upload_rejected',
      'delete_blocked', 'limit_hit', 'input_blocked', 'site_error']) {
      assert.equal(eventRequiresVerifiedToken(ev), false, ev);
    }
    assert.equal(eventRequiresVerifiedToken('nope'), false);
  });

  it('a verified token binds the row to the real account', () => {
    const d = auditIdentity('login_failed', { id: 'uid-1', email: 'real@site.com' }, 'fake@attacker.com');
    assert.equal(d.ok, true);
    assert.equal(d.email, 'real@site.com');
    assert.equal(d.source, 'verified');
    assert.equal(d.actorId, 'uid-1');
  });

  it('the posted email is ignored when the token is verified', () => {
    const d = auditIdentity('delete_blocked', { id: 'uid-2', email: 'boss@site.com' }, 'victim@site.com');
    assert.equal(d.email, 'boss@site.com');
    assert.equal(d.source, 'verified');
  });

  it('login_success without a token is refused', () => {
    assert.equal(auditIdentity('login_success', null, 'any@x.com').ok, false);
    assert.equal(auditIdentity('login_success', undefined, 'any@x.com').ok, false);
    assert.equal(auditIdentity('login_success', 'junk', 'any@x.com').ok, false);
    assert.equal(auditIdentity('login_success', [], 'any@x.com').ok, false);
  });

  it('login_success without an account email is refused', () => {
    assert.equal(auditIdentity('login_success', { id: 'u' }, '').ok, false);
    assert.equal(auditIdentity('login_success', { id: 'u', email: 5 }, '').ok, false);
    assert.equal(auditIdentity('login_success', { id: 'u', email: '' }, '').ok, false);
  });

  it('no token keeps the posted email but marks the row client (untrusted)', () => {
    const d = auditIdentity('site_error', null, 'visitor@x.com');
    assert.equal(d.ok, true);
    assert.equal(d.email, 'visitor@x.com');
    assert.equal(d.source, 'client');
    assert.equal(d.actorId, null);
  });

  it('no token + no email records an anonymous client row', () => {
    const d = auditIdentity('limit_hit', null, '');
    assert.equal(d.ok, true);
    assert.equal(d.email, null);
    assert.equal(d.source, 'client');
  });

  it('broken user objects fail safe (never treated as verified)', () => {
    assert.equal(auditIdentity('site_error', 5, 'a@b.com').source, 'client');
    assert.equal(auditIdentity('site_error', [], 'a@b.com').source, 'client');
    assert.equal(auditIdentity('site_error', 'junk', 'a@b.com').source, 'client');
    assert.equal(auditIdentity('site_error', { email: 'x@y.com' }, 'a@b.com').source, 'client');
  });

  it('verified user with odd email still records the actor id', () => {
    const d = auditIdentity('guard_denied', { id: 'uid-9' }, 'x@y.com');
    assert.equal(d.ok, true);
    assert.equal(d.actorId, 'uid-9');
    assert.equal(d.email, null);
    assert.equal(d.source, 'verified');
  });
});

// ---- 24. Phase 2 static guards: forgery-proof cap, labelled rows ----
describe('phase 2 doors and SQL guards', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const DEL = read('api/admin/delete.js');
  const LOG = read('api/log-event.js');
  const UP = read('api/upload-approve.js');
  const ADMINJS = read('admin/js/admin.js');
  const LOGIN = read('admin/login.html');
  const AUDIT = read('supabase/audit.sql');
  const P2 = read('supabase/phase2_audit_integrity.sql');

  it('delete door: the durable cap counts only verified success rows', () => {
    assert.ok(DEL.includes(".eq('actor_id', user.id)"), 'cap keyed on actor_id');
    assert.ok(DEL.includes(".eq('success', true)"), 'cap counts successes only');
    assert.ok(!DEL.includes(".eq('email'"), 'cap must not count by email (forgeable)');
    assert.ok(DEL.includes('actor_id: user.id'), 'door rows carry actor_id');
    assert.ok(DEL.includes("source: 'verified'"), 'door rows are labelled verified');
  });

  it('log door: identity binding + login_success gate', () => {
    assert.ok(LOG.includes("'login_success'"), 'event added to the allowlist');
    assert.ok(LOG.includes('auditIdentity('), 'shared identity resolver in use');
    assert.ok(LOG.includes('status(403)'), 'unverified login_success is refused');
    assert.ok(LOG.includes('actor_id: identity.actorId'), 'rows carry actor identity');
    assert.ok(LOG.includes('source: identity.source'), 'rows carry provenance');
  });

  it('upload door: rows are stamped with verified identity', () => {
    assert.ok(UP.includes('actor_id: user.id'));
    assert.ok(UP.includes("source: 'verified'"));
  });

  it('admin client: audit calls ride the live session token', () => {
    assert.ok(ADMINJS.includes("headers['Authorization'] = authHeader"), 'token attached to the door call');
    assert.ok(ADMINJS.includes('auth.getSession'), 'token read from the live session');
  });

  it('login page: successful sign-ins are audited', () => {
    assert.ok(LOGIN.includes("audit('login_success', email, true)"));
  });

  it('audit.sql + delta: identity columns exist, RPC stays client-only', () => {
    assert.ok(AUDIT.includes('actor_id text'), 'canonical table has actor_id');
    assert.ok(AUDIT.includes('source text'), 'canonical table has source');
    assert.ok(AUDIT.includes('admin_audit_actor_created_idx'), 'cap index in canonical');
    assert.ok(AUDIT.includes("nullif(p_detail, ''), 'client'"), 'canonical RPC labels rows client');
    assert.ok(P2.includes('add column if not exists actor_id'), 'delta adds actor_id');
    assert.ok(P2.includes('add column if not exists source'), 'delta adds source');
    assert.ok(P2.includes('admin_audit_actor_created_idx'), 'delta adds the cap index');
    assert.ok(P2.includes("'client'"), 'delta RPC labels rows client');
    assert.ok(!P2.includes('login_success'), 'RPC must never accept login_success (no caller to verify)');
    assert.ok(P2.includes('cron.schedule'), 'retention scheduled');
    assert.ok(P2.includes("interval '30 days'"), 'retention window is 30 days');
  });
});
