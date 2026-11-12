import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { stringify } from 'yaml';
import sharp from 'sharp';
import { exportContent, parseContentFile } from '../scripts/export-content.js';
import { buildSite } from '../scripts/build.js';
import { loadPosts } from '../src/content.js';

const sourceDir = resolve(import.meta.dirname, '../content/source-backup');
const siteUrl = 'https://hindiba-esakbas.pages.dev';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const cardLinks = html => [...html.matchAll(/<h3><a href="(\/yazi\/[^"?#]+)"/g)].map(match => match[1].replace(/\/$/, ''));

function files(directory, prefix = '') {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name), prefix + entry.name + '/') : [prefix + entry.name]).sort();
}
function snapshot(directory) { return Object.fromEntries(files(directory).map(file => [file, sha(readFileSync(join(directory, file)))])); }
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hindiba-free-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const contentDir = join(root, 'posts'), mediaDir = join(root, 'media'), outputDir = join(root, '_site');
  mkdirSync(mediaDir);
  const report = exportContent({ sourceDir, outputDir: contentDir });
  assert.equal(report.created, 9);
  return { root, contentDir, mediaDir, outputDir, siteUrl };
}
function contentFiles(directory) {
  return files(directory).filter(file => file.endsWith('.md')).map(file => ({ file, ...parseContentFile(readFileSync(join(directory, file))) }));
}
function addPost(f, { id = 'test-post', slug = 'test-post', status = 'published', title = 'Bir görselin hikâyesi', cover = '', aliases = [], body = 'Gerçek test paragrafı.' } = {}) {
  const meta = {
    id, title, slug, description: 'Görseller ve yayımlama akışı için test.', excerpt: 'Görseller ve yayımlama akışı için test.',
    cover, cover_alt: 'Bir test görseli', aliases, category: 'gunluk', tags: ['gunluk'], author: 'Eşref Akbaş',
    created_at: '2026-11-10T12:34:56Z', updated_at: '2026-11-10T12:34:56Z', published_at: '2026-11-10T12:34:56Z', status
  };
  const file = join(f.contentDir, id + '.md');
  writeFileSync(file, Buffer.concat([Buffer.from(`---\n${stringify(meta, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' })}---\n`), Buffer.from(body)]));
  return file;
}
function assertNoValue(directory, value) {
  for (const file of files(directory)) {
    assert.ok(!file.includes(value), `private filename escaped into output: ${file}`);
    assert.ok(!readFileSync(join(directory, file)).includes(Buffer.from(value)), `private value escaped into ${file}`);
  }
}

test('static build retains the nine real articles, byte-exact Markdown, dates, pagination, canonical URLs, RSS, sitemap and legacy links', async t => {
  const f = fixture(t), original = snapshot(f.contentDir), parsed = contentFiles(f.contentDir), loaded = loadPosts(f.contentDir);
  const issues = JSON.parse(readFileSync(join(sourceDir, 'github-issues.json'), 'utf8')).filter(issue => !issue.pull_request && issue.labels?.length);
  assert.equal(parsed.length, 9);
  for (const { metadata, bodyBytes } of parsed) {
    const source = issues.find(issue => String(issue.id) === metadata.legacy_id);
    assert.ok(source);
    assert.deepEqual(bodyBytes, Buffer.from(source.body));
    assert.equal(sha(bodyBytes), metadata.source_body_sha256);
    for (const key of ['created_at', 'updated_at', 'published_at']) assert.equal(typeof metadata[key], 'string');
    assert.equal(metadata.created_at, source.created_at);
    assert.equal(metadata.published_at, source.created_at);
    const post = loaded.find(post => post.id === metadata.id);
    assert.equal(sha(Buffer.from(post.body)), metadata.source_body_sha256);
    assert.equal(post.body, source.body);
    assert.equal(post.created_at, source.created_at);
    assert.equal(typeof post.created_at, 'string');
  }
  await buildSite({ ...f, branch: 'main' });
  assert.deepEqual(snapshot(f.contentDir), original, 'building must never rewrite original article files');
  const sorted = [...parsed].sort((a, b) => Date.parse(b.metadata.created_at) - Date.parse(a.metadata.created_at));
  const first = readFileSync(join(f.outputDir, 'index.html'), 'utf8');
  const second = readFileSync(join(f.outputDir, 'sayfa/2/index.html'), 'utf8');
  assert.equal(cardLinks(first).length, 6);
  assert.equal(cardLinks(second).length, 3);
  assert.deepEqual([...cardLinks(first), ...cardLinks(second)], sorted.map(post => '/yazi/' + post.metadata.slug));
  assert.ok(first.includes('/sayfa/2/'), 'pagination must link to a physical static page');
  assert.equal(new Set([...cardLinks(first), ...cardLinks(second)]).size, 9);
  assert.doesNotMatch(first + second, /örnek kayıt görünür|Hindiba Notu/);
  const legacyData = JSON.parse(readFileSync(join(f.outputDir, 'assets/legacy.json'), 'utf8'));
  const legacy = legacyData.map || legacyData;
  assert.equal(Object.keys(legacy).length, 9);
  for (const { metadata } of parsed) {
    const html = readFileSync(join(f.outputDir, 'yazi', metadata.slug, 'index.html'), 'utf8');
    assert.equal(decode(html.match(/<h1>([\s\S]*?)<\/h1>/)[1]), metadata.title);
    assert.ok(html.includes(`datetime="${metadata.created_at}"`));
    const canonical = decode(html.match(/rel="canonical" href="([^"]+)"/)[1]);
    assert.equal(canonical.replace(/\/$/, ''), siteUrl + '/yazi/' + metadata.slug);
    assert.equal(String(legacy[metadata.legacy_id]).replace(/\/$/, ''), '/yazi/' + metadata.slug);
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(structured.headline, metadata.title);
    assert.equal(structured.datePublished, metadata.published_at);
    assert.equal(structured.author.name, metadata.author);
  }
  const rss = readFileSync(join(f.outputDir, 'rss.xml'), 'utf8');
  const sitemap = readFileSync(join(f.outputDir, 'sitemap.xml'), 'utf8');
  assert.equal((rss.match(/<item>/g) || []).length, 9);
  const articleLocations = [...sitemap.matchAll(/<loc>([^<]*\/yazi\/[^<]+)<\/loc>/g)].map(match => decode(match[1]).replace(/\/$/, ''));
  assert.deepEqual(new Set(articleLocations), new Set(parsed.map(post => siteUrl + '/yazi/' + post.metadata.slug)));
  assert.equal(articleLocations.length, 9);
  assert.ok(files(f.outputDir).every(file => !/\.md$|source-backup|github-issues|checksums\.json/.test(file)), 'raw source and backups must stay outside the static output');
});

test('OAuth secrets, local environment files and private source directories never enter the public static output', async t => {
  const f = fixture(t), secret = 'FAKE-OAUTH-CLIENT-SECRET-' + randomUUID();
  writeFileSync(join(f.root, '.env'), `GITHUB_CLIENT_SECRET=${secret}\n`);
  writeFileSync(join(f.root, '.dev.vars'), `GITHUB_CLIENT_SECRET="${secret}"\n`);
  const previous = process.env.GITHUB_CLIENT_SECRET;
  try {
    process.env.GITHUB_CLIENT_SECRET = secret;
    await buildSite({ ...f, branch: 'main' });
    const emitted = files(f.outputDir);
    assert.ok(emitted.includes('index.html'));
    assert.ok(emitted.includes('admin/index.html'), 'the editor itself must still be delivered');
    assertNoValue(f.outputDir, secret);
    for (const path of emitted) {
      assert.doesNotMatch(path, /^(?:content|functions|src|tests|scripts)\//, 'application source directories must remain private');
      assert.doesNotMatch(path, /(?:^|\/)(?:source-backup|\.env(?:\.[^/]*)?|\.dev\.vars)(?:\/|$)/, 'backups and environment files must remain private');
      assert.ok(!path.endsWith('.md'), 'private Markdown article sources are never public assets');
    }
    assert.equal((readFileSync(join(f.outputDir, 'rss.xml'), 'utf8').match(/<item>/g) || []).length, 9);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = previous;
  }
});

test('draft article text, its referenced private image and every unreferenced image stay outside the public build', async t => {
  const f = fixture(t), marker = 'DRAFT-PRIVATE-TEXT-aac8af1c', photo = 'private-draft-photo.png', unused = 'unreferenced-private-photo.png';
  addPost(f, { id: 'private-draft', slug: 'private-draft', status: 'draft', title: marker, cover: '/uploads/' + photo, body: marker + `\n\n![Gizli görsel](/uploads/${photo})` });
  const missingStatusMarker = 'NO-PUBLISH-STATUS-PRIVATE-37c10c';
  const missingStatusFile = addPost(f, { id: 'missing-publish-status', slug: 'missing-publish-status', title: missingStatusMarker, body: missingStatusMarker });
  const missingStatus = parseContentFile(readFileSync(missingStatusFile));
  delete missingStatus.metadata.status;
  writeFileSync(missingStatusFile, Buffer.concat([Buffer.from(`---\n${stringify(missingStatus.metadata, { lineWidth: 0 })}---\n`), missingStatus.bodyBytes]));
  assert.equal(loadPosts(f.contentDir).find(post => post.id === 'missing-publish-status').status, 'draft', 'only an explicit published status may publish a document');
  const pixels = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#224433' } }).png().toBuffer();
  writeFileSync(join(f.mediaDir, photo), pixels);
  writeFileSync(join(f.mediaDir, unused), pixels);
  await buildSite({ ...f, branch: 'main' });
  assertNoValue(f.outputDir, marker);
  assertNoValue(f.outputDir, missingStatusMarker);
  assertNoValue(f.outputDir, photo);
  assertNoValue(f.outputDir, unused);
  assert.ok(!existsSync(join(f.outputDir, 'yazi/private-draft/index.html')));
  assert.ok(!existsSync(join(f.outputDir, 'yazi/missing-publish-status/index.html')));
  assert.equal(files(f.outputDir).filter(file => file.startsWith('uploads/')).length, 0, 'the nine original posts have no article media, so no uploaded image is publishable');
  assert.equal((readFileSync(join(f.outputDir, 'rss.xml'), 'utf8').match(/<item>/g) || []).length, 9);
});

test('non-main builds expose only noindex guard documents even if a draft branch labels its secret article published', async t => {
  const f = fixture(t), marker = 'UNPUBLISHED-BRANCH-SECRET-e32f4a', photo = 'unpublished-branch-image.png';
  addPost(f, { id: 'branch-private', slug: 'branch-private', status: 'published', title: marker, body: marker + `\n\n![Özel](/uploads/${photo})`, cover: '/uploads/' + photo });
  writeFileSync(join(f.mediaDir, photo), await sharp({ create: { width: 12, height: 12, channels: 3, background: '#aabbcc' } }).png().toBuffer());
  const assertGuard = () => {
    const emitted = files(f.outputDir);
    assert.ok(emitted.includes('index.html'));
    assert.ok(emitted.every(file => ['index.html', '404.html', 'robots.txt', '_headers'].includes(file)), emitted.join(', '));
    for (const name of emitted.filter(file => file.endsWith('.html'))) {
      const html = readFileSync(join(f.outputDir, name), 'utf8');
      assert.match(html, /noindex/i);
      assert.doesNotMatch(html, /<script\b|<img\b|\/yazi\//i);
    }
    assertNoValue(f.outputDir, marker);
    assertNoValue(f.outputDir, photo);
    for (const post of contentFiles(f.contentDir).filter(post => post.metadata.title.length > 4)) assertNoValue(f.outputDir, post.metadata.title);
  };
  await buildSite({ ...f, branch: 'cms/postdraft' });
  assertGuard();
  const previous = process.env.CF_PAGES_BRANCH;
  try {
    process.env.CF_PAGES_BRANCH = 'cms/postdraft-from-environment';
    await buildSite(f);
    assertGuard();
  } finally {
    if (previous === undefined) delete process.env.CF_PAGES_BRANCH;
    else process.env.CF_PAGES_BRANCH = previous;
  }
});

test('only referenced published photos are optimized to WebP, stripped of EXIF and mapped in rendered pages without changing Markdown', async t => {
  const f = fixture(t), exifMarker = 'PRIVATE-CAMERA-EXIF-7bcf19';
  const original = await sharp({ create: { width: 2600, height: 1300, channels: 3, background: '#336655' } }).withExif({ IFD0: { Artist: exifMarker, Copyright: exifMarker } }).jpeg().toBuffer();
  assert.ok((await sharp(original).metadata()).exif, 'the fixture must carry real EXIF');
  writeFileSync(join(f.mediaDir, 'published-photo.jpg'), original);
  writeFileSync(join(f.mediaDir, 'unreferenced-private.jpg'), original);
  const body = 'Bir fotoğraf ve bir hatıra.\r\n\r\n![Göldeki ışık](/uploads/published-photo.jpg?version=2#focus "Bir akşamın izi")\n';
  const file = addPost(f, { id: 'published-with-photo', slug: 'published-with-photo', body, cover: '/uploads/published-photo.jpg?cover=1#top' });
  const before = readFileSync(file);
  await buildSite({ ...f, branch: 'main' });
  assert.deepEqual(readFileSync(file), before);
  assert.equal(parseContentFile(readFileSync(file)).body, body);
  const uploaded = files(f.outputDir).filter(path => path.startsWith('uploads/'));
  assert.equal(uploaded.length, 1, 'one referenced photograph must produce exactly one optimized asset');
  assert.match(uploaded[0], /^uploads\/[a-f0-9]+\.webp$/);
  const image = readFileSync(join(f.outputDir, uploaded[0])), metadata = await sharp(image).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 1920 && metadata.height <= 1920);
  assert.equal(metadata.exif, undefined);
  assert.ok(!image.includes(Buffer.from(exifMarker)));
  const html = readFileSync(join(f.outputDir, 'yazi/published-with-photo/index.html'), 'utf8');
  assert.ok(html.includes(`src="/${uploaded[0]}"`));
  const renderedUploads = [...html.matchAll(/<img\b[^>]*src="(\/uploads\/[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(renderedUploads, ['/' + uploaded[0], '/' + uploaded[0]], 'query and fragment suffixes on cover and body images must both resolve to the existing optimized asset');
  const socialImage = new URL(decode(html.match(/property="og:image" content="([^"]+)"/)[1]));
  assert.equal(socialImage.pathname, '/' + uploaded[0]);
  assert.match(html, /alt="Göldeki ışık"/);
  assert.match(html, /<figcaption>Bir akşamın izi<\/figcaption>/);
  assert.doesNotMatch(html, /\/uploads\/published-photo\.jpg/);
  assertNoValue(f.outputDir, 'unreferenced-private.jpg');
});

test('reference-style images and escaped brackets in alternative text both resolve to optimized raster files', async t => {
  const f = fixture(t);
  for (const [name, color] of [['reference-photo.png', '#336655'], ['escaped-alt.png', '#aa6655']]) {
    writeFileSync(join(f.mediaDir, name), await sharp({ create: { width: 80, height: 40, channels: 3, background: color } }).png().toBuffer());
  }
  const body = '![Bir göl][lake]\n\n[lake]: /uploads/reference-photo.png "Kaynak açıklaması"\n\n![Köşeli \\] not](/uploads/escaped-alt.png "İkinci açıklama")\n';
  const source = addPost(f, { id: 'markdown-image-forms', slug: 'markdown-image-forms', body });
  const original = readFileSync(source);
  await buildSite({ ...f, branch: 'main' });
  const html = readFileSync(join(f.outputDir, 'yazi/markdown-image-forms/index.html'), 'utf8');
  const rendered = [...html.matchAll(/<img\b[^>]*src="(\/uploads\/[^"?#]+)"[^>]*alt="([^"]*)"/g)];
  assert.equal(rendered.length, 2, 'both supported Markdown forms must produce a rendered image');
  assert.deepEqual(rendered.map(match => decode(match[2])), ['Bir göl', 'Köşeli ] not']);
  assert.equal(new Set(rendered.map(match => match[1])).size, 2);
  for (const [, url] of rendered) {
    assert.match(url, /^\/uploads\/[a-f0-9]+\.webp$/);
    const bytes = readFileSync(join(f.outputDir, url.slice(1)));
    assert.equal((await sharp(bytes).metadata()).format, 'webp');
  }
  assert.match(html, /<figcaption>Kaynak açıklaması<\/figcaption>/);
  assert.match(html, /<figcaption>İkinci açıklama<\/figcaption>/);
  assert.doesNotMatch(html, /src="\/uploads\/(?:reference-photo|escaped-alt)\.png"/);
  assert.deepEqual(readFileSync(source), original, 'reference definitions and escapes must remain unchanged in the source');
});

test('image examples in fenced code and HTML comments never emit private photographs while a visible image still works', async t => {
  const f = fixture(t);
  for (const [name, color] of [['code-private.png', '#556677'], ['comment-private.png', '#aa3322'], ['visible-photo.png', '#336655']]) {
    writeFileSync(join(f.mediaDir, name), await sharp({ create: { width: 60, height: 30, channels: 3, background: color } }).png().toBuffer());
  }
  const body = [
    'Bir fotoğraf örneği:', '',
    '```html', '<img src="/uploads/code-private.png" alt="Yalnızca kod örneği">', '```', '',
    '<!-- <img src="/uploads/comment-private.png" alt="Yorum içindeki özel görsel"> -->', '',
    '![Görünen fotoğraf](/uploads/visible-photo.png "Yayımlanan görsel")', ''
  ].join('\n');
  const source = addPost(f, { id: 'private-media-examples', slug: 'private-media-examples', body });
  const original = readFileSync(source);
  await buildSite({ ...f, branch: 'main' });
  const uploaded = files(f.outputDir).filter(file => file.startsWith('uploads/'));
  assert.equal(uploaded.length, 1, 'only the visible image may be copied or optimized; code and comment references cannot publish private files');
  assert.equal((await sharp(readFileSync(join(f.outputDir, uploaded[0]))).metadata()).format, 'webp');
  const html = readFileSync(join(f.outputDir, 'yazi/private-media-examples/index.html'), 'utf8');
  const rendered = [...html.matchAll(/<img\b[^>]*src="(\/uploads\/[^"]+)"[^>]*alt="([^"]*)"/g)];
  assert.deepEqual(rendered.map(match => [match[1], decode(match[2])]), [['/' + uploaded[0], 'Görünen fotoğraf']]);
  assert.match(html, /&lt;img src=/, 'the code example itself remains readable without becoming an actual image');
  assert.ok(files(f.outputDir).every(file => !/(?:code-private|comment-private)\.png$/.test(file)));
  assert.deepEqual(readFileSync(source), original);
});

test('published aliases become permanent redirects while draft aliases remain private and do not reserve public addresses', async t => {
  const f = fixture(t);
  addPost(f, { id: 'renamed-post', slug: 'new-article-address', aliases: ['old-article-address', 'earlier-article-address', 'new-article-address'] });
  addPost(f, {
    id: 'private-alias-draft', slug: 'private-alias-draft', status: 'draft',
    aliases: ['hidden-draft-address', 'mazi'], title: 'PRIVATE-ALIAS-DRAFT-80f1d2', body: 'PRIVATE-ALIAS-DRAFT-80f1d2'
  });
  await buildSite({ ...f, branch: 'main' });
  const redirects = readFileSync(join(f.outputDir, '_redirects'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => line.trim().split(/\s+/));
  assert.deepEqual(redirects, [
    ['/yazi/old-article-address/', '/yazi/new-article-address/', '301'],
    ['/yazi/earlier-article-address/', '/yazi/new-article-address/', '301']
  ]);
  assert.ok(existsSync(join(f.outputDir, 'yazi/new-article-address/index.html')));
  assert.ok(!existsSync(join(f.outputDir, 'yazi/private-alias-draft/index.html')));
  assertNoValue(f.outputDir, 'hidden-draft-address');
  assertNoValue(f.outputDir, 'PRIVATE-ALIAS-DRAFT-80f1d2');
});

test('an alias cannot take another published article address and a rejected collision preserves the previous complete build', async t => {
  const f = fixture(t);
  await buildSite({ ...f, branch: 'main' });
  const previous = snapshot(f.outputDir);
  const existing = loadPosts(f.contentDir).find(post => post.status === 'published');
  const source = addPost(f, { id: 'conflicting-alias', slug: 'unrelated-new-address', aliases: [existing.slug] });
  const original = readFileSync(source);
  await assert.rejects(() => buildSite({ ...f, branch: 'main' }), /çakış/);
  assert.deepEqual(snapshot(f.outputDir), previous, 'all pages, search, feed and routing files must remain unchanged');
  assert.deepEqual(readFileSync(source), original, 'a rejected alias must not change the editor source');
});

test('invalid bytes, files over 10 MiB and images over 40 megapixels reject the build without changing a previous static snapshot', async t => {
  const f = fixture(t);
  await buildSite({ ...f, branch: 'main' });
  const preserved = snapshot(f.outputDir);
  const malicious = addPost(f, { id: 'invalid-photo', slug: 'invalid-photo', body: '![Görsel](/uploads/invalid-image.png)' });
  const cases = [
    ['invalid PNG bytes', Buffer.from('<svg onload="alert(1)"></svg>')],
    ['over 10 MiB', Buffer.alloc(10 * 1024 * 1024 + 1, 1)],
    ['over 40 megapixels', await sharp({ create: { width: 6401, height: 6400, channels: 3, background: '#ffffff' } }).png().toBuffer()]
  ];
  for (const [label, bytes] of cases) {
    writeFileSync(join(f.mediaDir, 'invalid-image.png'), bytes);
    await assert.rejects(() => buildSite({ ...f, branch: 'main' }), undefined, label);
    assert.deepEqual(snapshot(f.outputDir), preserved, label + ': previous output must remain byte-for-byte intact');
  }
  rmSync(join(f.mediaDir, 'invalid-image.png'));
  symlinkSync(resolve(import.meta.dirname, '../public/pp.jpg'), join(f.mediaDir, 'invalid-image.png'));
  await assert.rejects(() => buildSite({ ...f, branch: 'main' }), undefined, 'a media symlink may not copy bytes from outside the private media directory');
  assert.deepEqual(snapshot(f.outputDir), preserved, 'a rejected symlink must preserve the previous static snapshot');
  assert.ok(existsSync(malicious), 'a failed build must not delete source files');
});
