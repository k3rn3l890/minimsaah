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

  it('buildTag returns letters and digits only', () => {
    assert.match(inj.buildTag(), /^[A-Za-z0-9]+$/);
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

  function supaStub(rows, rpcLog) {
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
      throttledRpc: async (...a) => { if (rpcLog) rpcLog.push(a); return null; },
    };
  }

  it('getSlug reads ?slug=', () => {
    const s = stubsWith({ location: { search: '?slug=abc-1' } });
    assert.equal(loadLib(s).getSlug(), 'abc-1');
    const s2 = stubsWith({});
    assert.equal(loadLib(s2).getSlug(), null);
  });

  it('loadOne normalizes author and fires the view counter', async () => {
    const rpcLog = [];
    const s = stubsWith({
      location: { search: '?slug=x' },
      window: {
        SupabaseDB: supaStub(
          { id: '1', slug: 'x', first_name: 'A', author: { first_name: 'B', last_name: 'C' } },
          rpcLog),
      },
    });
    const row = await loadLib(s).loadOne({
      table: 'articles', select: '*,author:users(first_name,last_name)',
      withAuthor: true, view: 'articles',
    });
    assert.equal(row.firstName, 'A');
    assert.equal(row.author.lastName, 'C');
    assert.equal(rpcLog.length, 1);
    assert.deepEqual(rpcLog[0][1], { table_name: 'articles', row_id: '1' });
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

  it('loadOne falls back to fetch and normalizes', async () => {
    const s = stubsWith({ location: { search: '?slug=y' } });
    s.stubWindow.SupabaseDB = { isEnabled: () => false };
    const L = loadLib(s, async (url) => {
      assert.ok(url.endsWith('/events/y'));
      return { ok: true, json: async () => ({ id: '9', slug: 'y', first_name: 'Z' }) };
    });
    const row = await L.loadOne({ table: 'events' });
    assert.equal(row.firstName, 'Z');
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
    let wired = null;
    const doc2 = {
      getElementById: (id) => {
        wired = id;
        return { set onclick(fn) { wired = fn; } };
      },
      createElement: () => ({}),
    };
    const s2 = stubsWith({});
    s2.stubDocument = doc2;
    loadLib(s2).bindShareCopy();
    assert.equal(typeof wired, 'function');
  });
});

// ---- 6. log-event door rejection paths (no network) ----
describe('api/log-event door', () => {
  let handler;
  before(async () => {
    ({ default: handler } = await import('../api/log-event.js'));
  });

  function mockRes() {
    const res = { statusCode: 0, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    return res;
  }

  it('rejects non-POST with 405', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, socket: {} }, res);
    assert.equal(res.statusCode, 405);
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
});

// ---- 7. admin delete door rejection paths (no network) ----
describe('api/admin/delete door', () => {
  let delHandler;
  before(async () => {
    ({ default: delHandler } = await import('../api/admin/delete.js'));
  });

  function mockRes() {
    const res = { statusCode: 0, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    return res;
  }

  it('rejects non-POST with 405', async () => {
    const res = mockRes();
    await delHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
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

// ---- 10. drawer wiring (Phase 4) ----
describe('MinimsaahLib.wireDrawer', () => {
  function drawerStubs() {
    function mk() {
      return {
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
        addEventListener() {},
      };
    }
    function fin(s) {
      s.classList._s = s.classes;
      s.onclick = null;
      return s;
    }
    const t = fin(mk()), d = fin(mk()), c = fin(mk());
    const body = { style: {} };
    const doc = {
      getElementById: (id) => (
        id === 'menu-toggle-detail' ? t
        : id === 'mobile-drawer-detail' ? d
        : id === 'menu-close-detail' ? c : null),
      body,
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
    s.t.onclick();
    assert.ok(!s.d.classes.has('hidden'));
    assert.equal(s.t.attrs['aria-expanded'], 'true');
    assert.equal(s.body.style.overflow, 'hidden');
    s.c.onclick();
    assert.ok(s.d.classes.has('opacity-0'));
    assert.equal(s.t.attrs['aria-expanded'], 'false');
    assert.equal(s.body.style.overflow, '');
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
