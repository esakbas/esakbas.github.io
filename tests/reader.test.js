import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { importIssues, readSource } from '../scripts/import-issues.js';
import { createApp } from '../src/app.js';

const sourceDir = resolve(import.meta.dirname, '../content/source-backup');
const siteUrl = 'https://hindiba.example';
let dataDir, source, app, server, base, rows;
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const articleLinks = html => [...html.matchAll(/<h3><a href="(\/yazi\/[^"]+)">/g)].map(match => decode(match[1]));
const pathFor = row => `/yazi/${row.slug}`;
async function page(path, expectedStatus = 200) {
  const response = await fetch(base + path);
  assert.equal(response.status, expectedStatus, path);
  assert.match(response.headers.get('content-type') || '', /text\/html/, path);
  return response.text();
}
before(async () => {
  source = readSource(sourceDir);
  assert.equal(source.posts.length, 9, 'the archived repository has nine real blog posts');
  dataDir = mkdtempSync(join(tmpdir(), 'hindiba-reader-test-'));
  const result = importIssues({ sourceDir, dataDir });
  assert.equal(result.inserted, 9);
  app = createApp({ dataDir, siteUrl });
  rows = app.locals.db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  app?.locals.db?.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

test('real posts paginate without losses; Turkish search, categories, tags, bookmarks, archive and about routes work', async () => {
  const first = await page('/'), second = await page('/?sayfa=2');
  const firstLinks = articleLinks(first), secondLinks = articleLinks(second);
  assert.equal(firstLinks.length, 6);
  assert.equal(secondLinks.length, 3);
  assert.deepEqual([...firstLinks, ...secondLinks], rows.map(pathFor));
  assert.equal(new Set([...firstLinks, ...secondLinks]).size, 9);
  assert.ok(first.includes('href="/?sayfa=2"'));
  assert.doesNotMatch(first + second, /Hindiba Notu|örnek kayıt görünür/);

  const search = await page('/ara?q=' + encodeURIComponent('GÜLÜN'));
  const matched = rows.filter(row => `${row.title} ${row.body}`.toLocaleLowerCase('tr').includes('gülün'));
  assert.deepEqual(articleLinks(search), matched.map(pathFor));
  assert.equal(matched.length, 1);
  for (const [route, label] of [['kategori', 'edebiyat'], ['etiket', 'gunluk']]) {
    const expected = rows.filter(row => JSON.parse(row.tags).includes(label));
    const a = await page(`/${route}/${label}`);
    const links = articleLinks(a);
    if (expected.length > 6) links.push(...articleLinks(await page(`/${route}/${label}?sayfa=2`)));
    assert.deepEqual(links, expected.map(pathFor));
  }
  const savedRows = [rows[0], rows.at(-1)];
  const saved = await page('/?kayitlar=' + savedRows.map(row => row.legacy_id).join(','));
  assert.deepEqual(articleLinks(saved), savedRows.map(pathFor));
  assert.match(saved, /Kaydettiğin sayfalar/);
  const archive = await page('/arsiv');
  const archivedLinks = [...archive.matchAll(/<a href="(\/yazi\/[^"]+)"><time /g)].map(match => match[1]);
  assert.deepEqual(archivedLinks, rows.map(pathFor));
  assert.match(await page('/hakkinda'), /Merhaba, ben Eşref/);
  const missing = await page('/olmayan-bir-sayfa', 404);
  assert.match(missing, /Sayfa bulunamadı/);
  assert.match(missing, /noindex/);
});

test('all nine legacy links resolve to real articles with preserved source text, dates, metadata, RSS and sitemap entries', async () => {
  const response = await fetch(base + '/api/legacy');
  assert.equal(response.status, 200);
  const { map } = await response.json();
  assert.equal(Object.keys(map).length, 9);
  for (const issue of source.posts) {
    const row = rows.find(row => row.legacy_id === String(issue.id));
    assert.equal(row.title, issue.title);
    assert.equal(row.body, issue.body);
    assert.equal(row.created_at, issue.created_at);
    assert.equal(row.published_at, issue.created_at);
    assert.deepEqual(JSON.parse(row.tags), issue.labels.map(label => label.name));
    assert.equal(map[issue.id], pathFor(row));
    const html = await page(map[issue.id]);
    assert.equal(decode(html.match(/<h1>([\s\S]*?)<\/h1>/)[1]), issue.title);
    assert.ok(html.includes(`datetime="${issue.created_at}"`));
    assert.ok(html.includes(`rel="canonical" href="${siteUrl + pathFor(row)}"`));
    assert.ok(html.includes('property="og:type" content="article"'));
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(structured.headline, issue.title);
    assert.equal(structured.datePublished, issue.created_at);
    assert.equal(structured.author.name, issue.user.login);
    const opening = issue.body.split(/\r?\n/).find(line => line.trim()).trim();
    assert.ok(decode(html).includes(opening), `opening text missing for ${issue.title}`);
    const socialImage = decode(html.match(/property="og:image" content="([^"]+)"/)[1]);
    const image = await fetch(base + new URL(socialImage).pathname);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /^image\//);
  }
  const rss = await fetch(base + '/rss.xml');
  assert.equal(rss.status, 200);
  assert.match(rss.headers.get('content-type'), /xml/);
  const feed = await rss.text();
  assert.equal((feed.match(/<item>/g) || []).length, 9);
  const sitemap = await fetch(base + '/sitemap.xml');
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  const sitemapArticles = [...xml.matchAll(/<loc>([^<]+\/yazi\/[^<]+)<\/loc>/g)].map(match => decode(match[1]));
  assert.deepEqual(sitemapArticles, rows.map(row => siteUrl + pathFor(row)));
  for (const row of rows) assert.ok(feed.includes(siteUrl + pathFor(row)));
});

test('local reader assets and archived image bytes are served with the correct MIME types', async () => {
  const home = await page('/');
  const article = await page(pathFor(rows[0]));
  const assets = new Set();
  for (const html of [home, article]) {
    for (const match of html.matchAll(/<(?:img|script)\b[^>]*\bsrc="(\/[^"#?]*)/g)) assets.add(match[1]);
    for (const match of html.matchAll(/<link\b[^>]*rel="(?:stylesheet|icon)"[^>]*href="(\/[^"#?]*)/g)) assets.add(match[1]);
    for (const match of html.matchAll(/property="og:image" content="([^"]+)"/g)) assets.add(new URL(decode(match[1])).pathname);
  }
  assert.ok(assets.has('/reader.js'));
  assert.ok(assets.has('/style.css'));
  assert.ok(assets.has('/pp.jpg'));
  const types = { '.js': /(?:javascript|ecmascript)/, '.css': /text\/css/, '.jpg': /image\/jpeg/, '.png': /image\/png/, '.svg': /image\/svg\+xml/ };
  for (const asset of assets) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200, asset);
    const extension = asset.slice(asset.lastIndexOf('.'));
    assert.match(response.headers.get('content-type'), types[extension], asset);
    assert.doesNotMatch(response.headers.get('content-type'), /text\/html/, asset);
    assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
  }
  const imageMap = JSON.parse(readFileSync(join(dataDir, 'import-images.json'), 'utf8'));
  for (const image of source.images.filter(image => image.status === 'backed_up')) {
    const response = await fetch(base + imageMap[image.url]);
    assert.equal(response.status, 200, image.url);
    assert.equal(response.headers.get('content-type').split(';')[0], image.mime);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), image.sha256);
  }
});
