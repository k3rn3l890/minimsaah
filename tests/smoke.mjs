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
before(() => {
  Admin = loadBrowserScript('admin/js/admin.js', browserStubs()).Admin;
  Embeds = loadBrowserScript('assets/js/embeds.js', browserStubs()).MinimsaahEmbeds;
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
