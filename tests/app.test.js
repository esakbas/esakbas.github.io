import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { openDatabase, hashPassword } from '../src/db.js';
import { renderMarkdown } from '../src/markdown.js';

const SITE_URL = 'http://localhost:3000';
const password = 'Only-test-secret-3852!';
let dataDir, app, server, base, cookie, csrfToken, draft;

async function request(path, { method = 'GET', body, authenticated = false, csrf = true, origin = SITE_URL, headers = {}, redirect = 'follow' } = {}) {
  const options = { method, redirect, headers: { ...headers } };
  if (method !== 'GET' && method !== 'HEAD' && origin) options.headers.Origin = origin;
  if (authenticated && cookie) options.headers.Cookie = cookie;
  if (authenticated && csrf && csrfToken) options.headers['X-CSRF-Token'] = csrfToken;
  if (body !== undefined) {
    if (body instanceof FormData) options.body = body;
    else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  }
  return fetch(base + path, options);
}
async function json(response, status = 200) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  return JSON.parse(text);
}
async function update(fields) {
  const result = await json(await request('/api/admin/posts/' + draft.id, {
    method: 'PUT', authenticated: true,
    body: { ...draft, ...fields, updated_at: draft.updated_at }
  }));
  draft = result.post;
  return draft;
}
before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'hindiba-app-test-'));
  const db = openDatabase(dataDir);
  db.prepare('INSERT INTO admins(id,username,password_hash,created_at) VALUES(?,?,?,?)')
    .run('test-admin', 'editor', hashPassword(password), new Date().toISOString());
  db.close();
  app = createApp({ dataDir, siteUrl: SITE_URL });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  app?.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('admin operations require authentication; no SQLite/private data can be downloaded', async () => {
  for (const path of ['/api/admin/posts', '/api/admin/media']) {
    assert.equal((await request(path)).status, 401);
  }
  assert.equal((await request('/api/admin/posts', { method: 'POST', body: { title: 'Unauthorized' } })).status, 401);
  for (const path of ['/data/hindiba.sqlite', '/hindiba.sqlite', '/.env', '/originals/test.jpg', '/api/admin/../../data/hindiba.sqlite']) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.ok(!(await response.text()).startsWith('SQLite format 3'), path);
  }
  const session = await json(await request('/api/admin/session'));
  assert.equal(session.authenticated, false);
});

test('login rejects invalid credentials and foreign origins, then sets private session cookie', async () => {
  assert.equal((await request('/api/admin/login', { method: 'POST', body: { username: 'editor', password: 'wrong' } })).status, 401);
  assert.equal((await request('/api/admin/login', { method: 'POST', origin: 'https://evil.example', body: { username: 'editor', password } })).status, 403);
  const response = await request('/api/admin/login', { method: 'POST', body: { username: 'editor', password } });
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  cookie = setCookie.split(';')[0];
  const rawToken = cookie.slice(cookie.indexOf('=') + 1);
  const sessionRow = app.locals.db.prepare('SELECT token_hash FROM sessions').get();
  assert.notEqual(sessionRow.token_hash, rawToken);
  assert.match(sessionRow.token_hash, /^[a-f0-9]{64}$/);
  const result = await json(response);
  assert.equal(result.authenticated, true);
  assert.ok(result.csrfToken?.length >= 32);
  csrfToken = result.csrfToken;
  const session = await json(await request('/api/admin/session', { authenticated: true }));
  assert.equal(session.authenticated, true);
});

test('mutations require CSRF and same origin; imported Markdown is kept exactly in a saved draft', async () => {
  const body = { title: 'Deneme: Türkçe bir başlık', slug: 'turkce-deneme', excerpt: 'Gerçek bir açıklama.', body: 'İlk satır.\n\nİkinci satır: **kalın**,  iki boşluk.  \n![Bir görsel](/pp.jpg "Açıklama")\n', category: 'gunluk', tags: ['gunluk', 'deneme'], author: 'Eşref Akbaş', status: 'draft', created_at: '2024-03-02T10:20:30.000Z' };
  assert.equal((await request('/api/admin/posts', { method: 'POST', authenticated: true, csrf: false, body })).status, 403);
  assert.equal((await request('/api/admin/posts', { method: 'POST', authenticated: true, origin: 'https://evil.example', body })).status, 403);
  const result = await json(await request('/api/admin/posts', { method: 'POST', authenticated: true, body }), 201);
  draft = result.post;
  assert.equal(draft.body, body.body);
  assert.equal(draft.created_at, body.created_at);
  assert.equal(draft.author, body.author);
  assert.deepEqual(draft.tags, body.tags);
  const saved = await json(await request('/api/admin/posts/' + draft.id, { authenticated: true }));
  assert.equal(saved.post.body, body.body);
  assert.equal((await request('/yazi/' + draft.slug)).status, 404);
  assert.equal((await request('/admin/preview/' + draft.id)).status, 401);
  const preview = await request('/admin/preview/' + draft.id, { authenticated: true });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Türkçe bir başlık/);
  assert.match(preview.headers.get('x-robots-tag') || '', /noindex/);
});

test('preview sanitizes HTML/Markdown including scripts, event handlers and unsafe URLs', async () => {
  const { html } = await json(await request('/api/admin/preview', { method: 'POST', authenticated: true, body: { body: '<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[bad](javascript:alert(3))\n\n<iframe src="https://evil.example"></iframe>\n\n**Güvenli**\n\n![alt](/uploads/a.webp "Açıklama")' } }));
  assert.doesNotMatch(html, /<script|onerror|(?:href|src)\s*=\s*["']?\s*javascript:|<iframe/i);
  assert.match(html, /<strong>Güvenli<\/strong>/);
  assert.match(html, /alt="alt"/);
});

test('archived image URLs become local without changing source Markdown; captions and alt text stay safe and visible', () => {
  const body = '![Bir çiçek](https://example.org/photo.jpg "Bir <not> & açıklama")';
  const map = { 'https://example.org/photo.jpg': '/uploads/import-test.jpg' };
  const html = renderMarkdown(body, map);
  assert.match(html, /src="\/uploads\/import-test\.jpg"/);
  assert.match(html, /alt="Bir çiçek"/);
  assert.match(html, /<figcaption>Bir &lt;not&gt; &amp; açıklama<\/figcaption>/);
  assert.equal(body, '![Bir çiçek](https://example.org/photo.jpg "Bir <not> & açıklama")');
  const invalidMap = renderMarkdown('![Görsel](https://example.org/photo.jpg)', { 'https://example.org/photo.jpg': 'javascript:alert(1)' });
  assert.doesNotMatch(invalidMap, /javascript:/);
  assert.match(invalidMap, /src="https:\/\/example.org\/photo\.jpg"/);
});

test('concurrent stale edits are rejected instead of overwriting new content', async () => {
  const old = { ...draft };
  await update({ excerpt: 'Yeni açıklama.' });
  const response = await request('/api/admin/posts/' + draft.id, { method: 'PUT', authenticated: true, body: { ...old, title: 'Stale overwrite' } });
  assert.equal(response.status, 409);
  const latest = await json(await request('/api/admin/posts/' + draft.id, { authenticated: true }));
  assert.equal(latest.post.excerpt, 'Yeni açıklama.');
  assert.notEqual(latest.post.title, 'Stale overwrite');
});

test('drafts stay out of home, sitemap, RSS and legacy lookup; published articles become visible', async () => {
  app.locals.db.prepare('UPDATE posts SET legacy_id=? WHERE id=?').run('6210660748', draft.id);
  const hiddenMap = await json(await request('/api/legacy'));
  assert.equal(hiddenMap.map['6210660748'], undefined);
  for (const path of ['/', '/sitemap.xml', '/rss.xml']) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /turkce-deneme/);
  }
  await update({ status: 'published' });
  const visibleMap = await json(await request('/api/legacy'));
  assert.equal(visibleMap.map['6210660748'], '/yazi/' + draft.slug);
  const article = await request('/yazi/' + draft.slug);
  assert.equal(article.status, 200);
  const html = await article.text();
  assert.match(html, /Türkçe bir başlık/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /2024/);
  for (const path of ['/sitemap.xml', '/rss.xml']) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /turkce-deneme/);
  }
});

test('renaming an article creates a permanent redirect; unpublishing hides both old and new addresses', async () => {
  const oldSlug = draft.slug;
  await update({ slug: 'yenilenmis-yazi-adresi' });
  const redirect = await request('/yazi/' + oldSlug, { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(new URL(redirect.headers.get('location'), base).pathname, '/yazi/' + draft.slug);
  await update({ status: 'draft' });
  assert.equal((await json(await request('/api/legacy'))).map['6210660748'], undefined);
  assert.equal((await request('/yazi/' + draft.slug)).status, 404);
  assert.equal((await request('/yazi/' + oldSlug, { redirect: 'manual' })).status, 404);
  for (const path of ['/sitemap.xml', '/rss.xml']) assert.doesNotMatch(await (await request(path)).text(), /yenilenmis-yazi-adresi/);
});

test('image uploads validate bytes and size; persist optimized image plus private original and editable metadata', async () => {
  let form = new FormData();
  form.append('file', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/jpeg' }), 'fake.jpg');
  form.append('alt', 'Sahte görsel');
  assert.equal((await request('/api/admin/media', { method: 'POST', authenticated: true, body: form })).status, 422);
  form = new FormData();
  form.append('file', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' }), 'too-large.png');
  assert.equal((await request('/api/admin/media', { method: 'POST', authenticated: true, body: form })).status, 413);
  const original = await sharp({ create: { width: 2200, height: 1100, channels: 3, background: '#226653' } }).png().toBuffer();
  form = new FormData();
  form.append('file', new Blob([original], { type: 'image/png' }), '../../photograph.png');
  form.append('alt', 'Yeşil bir alan');
  form.append('caption', 'Görsel açıklaması');
  const { media } = await json(await request('/api/admin/media', { method: 'POST', authenticated: true, body: form }), 201);
  assert.equal(media.alt, 'Yeşil bir alan');
  assert.equal(media.caption, 'Görsel açıklaması');
  assert.ok(media.width <= 1920);
  assert.match(media.url, /^\/uploads\/[\w.-]+\.webp$/);
  const image = await request(media.url);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/webp/);
  const optimized = Buffer.from(await image.arrayBuffer());
  assert.equal((await sharp(optimized).metadata()).format, 'webp');
  const privateOriginals = readdirSync(join(dataDir, 'originals'));
  assert.equal(privateOriginals.length, 1);
  assert.deepEqual(readFileSync(join(dataDir, 'originals', privateOriginals[0])), original);
  assert.equal((await request('/originals/' + privateOriginals[0])).status, 404);
  const edited = await json(await request('/api/admin/media/' + media.id, { method: 'PUT', authenticated: true, body: { alt: 'Düzeltilmiş alternatif metin', caption: 'Yeni açıklama' } }));
  assert.equal(edited.media.alt, 'Düzeltilmiş alternatif metin');
  const list = await json(await request('/api/admin/media', { authenticated: true }));
  assert.ok(list.media.some(item => item.id === media.id));
});

test('saved posts and password hashes survive a database reopen without plaintext credentials', async () => {
  const db = openDatabase(dataDir);
  const stored = db.prepare('SELECT body,created_at,status FROM posts WHERE id=?').get(draft.id);
  assert.equal(stored.body, draft.body);
  assert.equal(stored.created_at, draft.created_at);
  assert.equal(stored.status, 'draft');
  const admin = db.prepare('SELECT password_hash FROM admins WHERE username=?').get('editor');
  assert.match(admin.password_hash, /^scrypt\$/);
  assert.ok(!admin.password_hash.includes(password));
  db.close();
  assert.ok(!readFileSync(join(dataDir, 'hindiba.sqlite')).includes(Buffer.from(password)));
});

test('logout invalidates the stored session and protected mutations stop working', async () => {
  await json(await request('/api/admin/logout', { method: 'POST', authenticated: true, body: {} }));
  assert.equal((await request('/api/admin/posts', { authenticated: true })).status, 401);
  assert.equal((await request('/api/admin/media', { authenticated: true })).status, 401);
  const session = await json(await request('/api/admin/session', { authenticated: true }));
  assert.equal(session.authenticated, false);
});

test('repeated failed logins are throttled and the throttle survives in SQLite', async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await request('/api/admin/login', { method: 'POST', body: { username: 'editor', password: 'incorrect' } })).status, 401);
  }
  const limited = await request('/api/admin/login', { method: 'POST', body: { username: 'editor', password } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  const db = openDatabase(dataDir);
  assert.equal(db.prepare('SELECT count FROM login_attempts').get().count, 10);
  db.close();
});

test('production rejects HTTP canonical URLs and issues Secure host-only cookies over HTTPS configuration', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hindiba-production-test-'));
  let productionApp, productionServer;
  try {
    assert.throws(() => createApp({ dataDir: directory, siteUrl: 'http://blog.example', production: true }), /HTTPS/);
    const db = openDatabase(directory);
    db.prepare('INSERT INTO admins(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .run('production-admin', 'editor', hashPassword(password), new Date().toISOString());
    db.close();
    productionApp = createApp({ dataDir: directory, siteUrl: 'https://blog.example', production: true });
    productionServer = productionApp.listen(0, '127.0.0.1');
    await new Promise(resolve => productionServer.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${productionServer.address().port}/api/admin/login`, {
      method: 'POST', headers: { Origin: 'https://blog.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'editor', password })
    });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /^__Host-hindiba_session=/);
    assert.match(setCookie, /; Secure/i);
    assert.match(setCookie, /; HttpOnly/i);
    assert.match(setCookie, /; Path=\//i);
    assert.doesNotMatch(setCookie, /; Domain=/i);
    assert.match(response.headers.get('strict-transport-security'), /max-age=/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally {
    if (productionServer) await new Promise(resolve => productionServer.close(resolve));
    productionApp?.locals.db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
