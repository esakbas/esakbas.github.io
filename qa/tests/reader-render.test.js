import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { renderPage } from '../src/render.js';
import { renderMarkdown } from '../src/markdown.js';
import { loadPosts } from '../src/content.js';
import { buildIcons } from '../src/icons.js';
import { stringify } from 'yaml';
import { exportContent, parseContentFile, slugify } from '../scripts/export-content.js';
import { buildSite } from '../scripts/build.js';

const article = overrides => ({
  id: 'year-boundary', slug: 'yil-siniri', title: 'Yılın ilk notu',
  body: 'Yeni gövdeden üretilecek açıklama.', excerpt: '', tags: [],
  category: 'gunluk', author: 'Eşref Akbaş', cover: '', cover_alt: '',
  created_at: '2025-12-31T22:30:00Z', updated_at: '2025-12-31T22:30:00Z',
  published_at: '2025-12-31T22:30:00Z', status: 'published', ...overrides
});

test('Windows frontmatter is accepted without changing Unicode, mixed newlines or body bytes', () => {
  const body = Buffer.from('  İstanbul; özgün bir satır.\r\n\r\n---\nSon satır\r\n');
  for (const newline of ['\n', '\r\n']) {
    const source = Buffer.concat([Buffer.from(`---${newline}title: Bir yazı${newline}---${newline}`), body]);
    const original = Buffer.from(source);
    const parsed = parseContentFile(source);
    assert.equal(parsed.metadata.title, 'Bir yazı');
    assert.deepEqual(parsed.bodyBytes, body);
    assert.deepEqual(source, original);
  }
  assert.equal(slugify('a'.repeat(99) + ' b'), 'a'.repeat(99), 'truncation must not create a slug ending in a hyphen');
});

test('archive years and year filters agree with the displayed Istanbul date on other server time zones', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      const posts = [article(), article({ id: 'older', slug: 'eski-not', created_at: '2025-01-01T12:00:00Z' })];
      const archive = renderPage({ pathname: '/arsiv', posts });
      assert.match(archive, /<h2>2026<\/h2>/);
      assert.match(archive, /<h2>2025<\/h2>/);
      const filtered = renderPage({ posts, query: { yil: '2026' } });
      assert.match(filtered, /<option value="2026" selected>2026<\/option>/);
      assert.match(filtered, /<span class="post-count">1 yazı<\/span>/);
      assert.match(filtered, /1 Ocak 2026/);
      assert.doesNotMatch(filtered, /<h3><a href="\/yazi\/eski-not"/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;else process.env.TZ = previous;
  }
});

test('clearing the CMS description derives a fresh body excerpt instead of restoring a stale legacy excerpt', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hindiba-description-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const metadata = { ...article(), description: '', excerpt: 'ESKI_OZET_GERI_DONMEMELI' };
  delete metadata.body;
  const body = 'Yeni düzenlenen gövde; özgün satırlar korunur.\r\n\r\nİkinci satır.\n';
  const file = join(root, 'post.md');
  const save = async value => writeFile(file, `---\n${stringify(value)}---\n${body}`);
  await save(metadata);
  const original = await readFile(file);
  const post = loadPosts(root)[0];
  assert.equal(post.excerpt, '');
  assert.equal(post.body, body);
  const html = renderPage({ posts: [post], post });
  assert.match(html, /Yeni düzenlenen gövde/);
  assert.doesNotMatch(html, /ESKI_OZET_GERI_DONMEMELI/);
  assert.deepEqual(await readFile(file), original);
  delete metadata.description;
  await save(metadata);
  assert.equal(loadPosts(root)[0].excerpt, 'ESKI_OZET_GERI_DONMEMELI', 'legacy documents without a description field still retain their excerpt');
});

test('article metadata remains valid JSON and markup cannot execute through titles or Markdown', () => {
  const title = 'Bir <hatıra> & "not" </script><script>alert(1)</script>';
  const post = article({ title, author: 'Bir <yazar>', body: 'Güvenli paragraf.\n\n<script>alert(1)</script>\n\n[Bağlantı](javascript:alert(1))\n\n<img src="https://example.invalid/photo.png" onerror="alert(1)"><iframe src="https://example.invalid"></iframe>' });
  const html = renderPage({ posts: [post], post, siteUrl: 'https://example.invalid' });
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.headline, title);
  assert.equal(data.author.name, post.author);
  assert.match(html, /<meta name="author" content="Bir &lt;yazar&gt;">/);
  assert.doesNotMatch(html, /<script>alert|onerror=|href="javascript:|<iframe/);
  const body = renderMarkdown(post.body);
  assert.match(body, /Güvenli paragraf/);
  assert.match(body, /src="https:\/\/example.invalid\/photo.png"/);
  assert.doesNotMatch(body, /<script|onerror|javascript:|<iframe/);
});

test('the navy favicon has content-versioned SVG and valid PNG, Apple and ICO fallbacks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hindiba-icons-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = resolve(import.meta.dirname, '../public/favicon.svg');
  const icons = await buildIcons(source, root);
  assert.match(icons.svg, /^\/assets\/favicon-[a-f0-9]{12}\.svg$/);
  assert.deepEqual(await readFile(join(root, icons.svg)), await readFile(source));
  const small = await readFile(join(root, icons.png));
  const metadata = await sharp(small).metadata();
  assert.equal(metadata.format, 'png');assert.equal(metadata.width, 32);assert.equal(metadata.height, 32);
  const stats = await sharp(small).stats();
  assert.ok(stats.channels[2].mean > stats.channels[1].mean, 'the icon uses the blue/indigo palette');
  const apple = await sharp(await readFile(join(root, icons.apple))).metadata();
  assert.equal(apple.width, 180);assert.equal(apple.height, 180);
  const ico = await readFile(join(root, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1);assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico[6], 32);assert.equal(ico[7], 32);
  assert.equal(ico.readUInt32LE(14), small.length);
  assert.deepEqual(ico.subarray(ico.readUInt32LE(18)), small);
  const next = join(root, 'changed.svg');
  await writeFile(next, (await readFile(source, 'utf8')).replace('#d7dcff', '#c4b5fd'));
  assert.notEqual((await buildIcons(next, root)).svg, icons.svg);
  const page = renderPage({ icons });
  assert.ok(page.includes(`href="${icons.svg}"`));
  assert.ok(page.includes(`href="${icons.png}"`));
  assert.ok(page.includes(`href="${icons.apple}"`));
});

test('the unfiltered search page has a real later page while all search pages remain outside the sitemap', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hindiba-search-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'posts'), mediaDir = join(root, 'media'), outputDir = join(root, 'site');
  await mkdir(mediaDir);
  exportContent({ sourceDir: resolve(import.meta.dirname, '../content/source-backup'), outputDir: contentDir });
  await buildSite({ contentDir, mediaDir, outputDir, branch: 'main', siteUrl: 'https://example.invalid' });
  const first = await readFile(join(outputDir, 'ara/index.html'), 'utf8');
  const second = await readFile(join(outputDir, 'ara/sayfa/2/index.html'), 'utf8');
  assert.match(first, /href="\/ara\/sayfa\/2\/"/);
  assert.equal((second.match(/class="post-card"/g) || []).length, 3);
  assert.match(second, /rel="canonical" href="https:\/\/example.invalid\/ara\/sayfa\/2\/"/);
  assert.match(second, /name="robots" content="noindex,nofollow"/);
  assert.match(first, /name="yil" aria-label="Yıl"/);
  assert.match(first, /name="sira" aria-label="Sıralama"/);
  assert.doesNotMatch(await readFile(join(outputDir, 'sitemap.xml'), 'utf8'), /<loc>[^<]*\/ara\//);
  const icon = first.match(/href="([^"]+)" sizes="any" type="image\/svg\+xml"/)[1];
  assert.ok((await readFile(join(outputDir, 'admin/index.html'), 'utf8')).includes(`href="${icon}"`));
});
