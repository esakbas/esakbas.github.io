import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { parse as parseYaml } from 'yaml';
import { exportContent, parseContentFile } from '../scripts/export-content.js';

const source = readFileSync(new URL('../admin/custom.js', import.meta.url), 'utf8');
const config = parseYaml(readFileSync(new URL('../admin/config.yml', import.meta.url), 'utf8'));

// Minimal immutable entry interface: execute the complete production bootstrap
// and its registered hook, without a browser, OAuth credential or repository write.
class Fields {
  constructor(values) { this.values = Object.freeze({ ...values }); }
  get(name) { return this.values[name]; }
  set(name, value) { return new Fields({ ...this.values, [name]: value }); }
}
async function hookFixture() {
  let domReady;
  let save;
  const startup = { hidden: false };
  const root = { querySelectorAll: () => [] };
  const widgets = new Map(['image', 'markdown'].map(name => [name, { control() {}, preview() {}, schema: {} }]));
  const cms = {
    getWidget: name => widgets.get(name),
    registerWidget: (name, control, preview, schema) => widgets.set(name, { control, preview, schema }),
    getLocale: () => ({}),
    registerLocale() {},
    registerEditorComponent() {},
    registerPreviewStyle() {},
    registerPreviewTemplate() {},
    registerEventListener(event) { if (event.name === 'preSave') save = event.handler; },
    init() {}
  };
  const context = {
    window: { CMS: cms, h() {}, createClass: component => component },
    document: {
      addEventListener(name, callback) { if (name === 'DOMContentLoaded') domReady = callback; },
      getElementById: id => id === 'nc-root' ? root : startup
    },
    MutationObserver: class { observe() {} },
    location: { origin: 'https://hindiba.example', host: 'hindiba.example' },
    crypto: { randomUUID },
    fetch: async () => ({ ok: true, json: async () => structuredClone(config) })
  };
  vm.runInNewContext(source, context, { filename: 'admin/custom.js' });
  assert.equal(context.window.CMS_MANUAL_INIT, true);
  await domReady();
  assert.equal(startup.hidden, true);
  assert.equal(typeof save, 'function', 'the production bootstrap must register the preSave hook');
  const run = async (data, metadata = {}) => save({ entry: new Fields({ collection: 'posts', ...metadata, data: data instanceof Fields ? data : new Fields(data) }) });
  run.widgets = widgets;
  return run;
}
function freshPost(overrides = {}) {
  return { title: 'İçimdeki Şiir', body: 'Bir paragraf.\n', created_at: '2026-11-13T08:42:15+03:00', ...overrides };
}

test('two new posts with the same Turkish title receive distinct IDs and valid automatic public URLs', async () => {
  const save = await hookFixture();
  const first = await save(freshPost());
  const second = await save(freshPost());
  assert.notEqual(first.get('id'), second.get('id'));
  assert.notEqual(first.get('slug'), second.get('slug'));
  for (const post of [first, second]) {
    assert.match(post.get('id'), /^[a-f0-9-]{36}$/);
    assert.match(post.get('slug'), /^icimdeki-siir-[a-f0-9]{8}$/);
    assert.ok(post.get('slug').length <= 160);
    assert.equal(post.get('status'), 'published');
  }
});

test('saving again or editing the title preserves the generated ID and public URL', async () => {
  const save = await hookFixture();
  const first = await save(freshPost());
  const repeated = await save(first, { newRecord: false });
  const renamed = await save(repeated.set('title', 'Başlığı daha sonra değiştirdim'), { newRecord: false });
  for (const post of [repeated, renamed]) {
    assert.equal(post.get('id'), first.get('id'));
    assert.equal(post.get('slug'), first.get('slug'));
    assert.equal(post.get('created_at'), first.get('created_at'));
    assert.equal(post.get('published_at'), first.get('published_at'));
    assert.equal(post.get('body'), first.get('body'));
  }
});

test('saving legacy content preserves its ID, body bytes, original dates, address and migration metadata', async t => {
  const save = await hookFixture();
  const temporary = mkdtempSync(join(tmpdir(), 'hindiba-hook-legacy-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  // Rebuild the fixture from the immutable archive: a future panel edit or
  // unpublish must not break these tests by removing the current source file.
  exportContent({ sourceDir: fileURLToPath(new URL('../content/source-backup', import.meta.url)), outputDir: temporary });
  const archived = parseContentFile(readFileSync(join(temporary, 'github-6210660748.md')));
  const saved = await save({ ...archived.metadata, body: archived.body }, { newRecord: false });
  assert.equal(saved.get('id'), archived.metadata.id);
  assert.equal(saved.get('slug'), archived.metadata.slug);
  assert.deepEqual(Buffer.from(saved.get('body'), 'utf8'), archived.bodyBytes);
  for (const name of ['created_at', 'published_at', 'legacy_id', 'source_key', 'source_file', 'source_body_sha256', 'source_issue_number', 'source_url', 'legacy_url', 'author', 'tags', 'category']) {
    assert.deepEqual(saved.get(name), archived.metadata[name], name);
  }
  assert.ok(Number.isFinite(Date.parse(saved.get('updated_at'))));
});

test('the hook preserves CRLF, leading/trailing whitespace, Unicode and timestamp offsets', async () => {
  const save = await hookFixture();
  const body = '\r\n  Sevgili Hindiba,\r\n\r\n---\nİı Şş Ğğ Öö Üü Çç 🌿\u2028\nSon satır.  ';
  const input = freshPost({ id: 'github-42', slug: 'eski-adres', body, published_at: '2026-11-12T23:14:15.678Z' });
  const result = await save(input, { newRecord: false });
  assert.equal(result.get('id'), input.id);
  assert.equal(result.get('slug'), input.slug);
  assert.deepEqual(Buffer.from(result.get('body')), Buffer.from(body));
  assert.equal(result.get('created_at'), input.created_at);
  assert.equal(result.get('published_at'), input.published_at);
});

test('valid manual addresses are preserved exactly, including the supported 160-character boundary', async () => {
  const save = await hookFixture();
  for (const slug of ['benim-sectigim-adres', 'a'.repeat(160)]) {
    const first = await save(freshPost({ slug }));
    const repeated = await save(first);
    assert.equal(first.get('slug'), slug);
    assert.equal(repeated.get('slug'), slug);
    assert.equal(repeated.get('id'), first.get('id'));
  }
});

test('invalid manual addresses fail clearly instead of silently changing an intended public URL', async () => {
  const save = await hookFixture();
  for (const slug of ['Türkçe Adres', 'buyuk-Harf', 'iki--tire', '/yazi/adres', 'a'.repeat(161)]) {
    await assert.rejects(save(freshPost({ slug })), /Yazı adresinde yalnızca küçük Latin harfleri/);
  }
});

test('unsafe categories and tags fail before a CMS save can break the public build', async () => {
  const save = await hookFixture();
  await assert.rejects(save(freshPost({ category: '../private' })), /geçerli bir kategori/);
  for (const tags of [['..'], ['van/notlari'], ['Büyük Harf'], ['a'.repeat(81)]]) {
    await assert.rejects(save(freshPost({ category: 'gunluk', tags })), /Etiketlerde küçük Latin/);
  }
  const valid = await save(freshPost({ category: 'gunluk', tags: ['van-notlari', '2026'] }));
  assert.deepEqual(valid.get('tags'), ['van-notlari', '2026']);
});

test('image and Markdown controls tolerate Decap mounting before its media resolver exists', async () => {
  const save = await hookFixture();
  for (const name of ['image', 'markdown']) {
    const control = save.widgets.get(name).control;
    assert.doesNotThrow(() => control.render.call({ props: { value: '/uploads/erken.png' }, control: null }));
  }
});

test('long or punctuation-only titles still generate valid URLs within the build limit', async () => {
  const save = await hookFixture();
  for (const title of ['Ş'.repeat(300), '...']) {
    const saved = await save(freshPost({ title }));
    assert.match(saved.get('slug'), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(saved.get('slug').length <= 160);
  }
});
