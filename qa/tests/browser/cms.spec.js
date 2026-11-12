import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

const realTitle = 'Yine bir Van akşamı, yine sonbahar…';
const privateMarker = 'HINDIBA_CI_ONLY_PRIVATE_DRAFT_40d9857d';
const origin = 'http://127.0.0.1:4173';

async function monitor(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
  // No test possesses a real OAuth token or may write to an external service.
  await page.route('https://**/*', route => route.abort('blockedbyclient'));
  return errors;
}
async function assertHealthy(page, errors) {
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__cspViolations || [])).toEqual([]);
}
async function assertNoOverflow(page) {
  const size = await page.evaluate(() => ({ visible: document.documentElement.clientWidth, actual: document.documentElement.scrollWidth }));
  expect(size.actual).toBeLessThanOrEqual(size.visible + 1);
}
async function editorData(page) {
  return page.evaluate(() => window.CMS.editor.getCurrentEntry()?.data || null);
}
async function typeMarkdown(control, value) {
  // Real keyboard input exercises Slate on desktop and Android emulation;
  // setting a contenteditable value directly bypasses its mobile input model.
  await control.click();
  await control.press('ControlOrMeta+A');
  await control.press('Backspace');
  const lines = value.split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (index) await control.press('Enter');
    if (lines[index]) await control.pressSequentially(lines[index]);
  }
}
async function memoryBackend(page, repoTree) {
  await page.addInitScript(({ repoTree }) => {
    window.repoFiles = repoTree;
    // The official test backend enumerates nested collection folders by literal
    // key, while its writer traverses segments. Share the same in-memory map.
    window.repoFiles['content/posts'] = window.repoFiles.content.posts;
    window.repoFilesUnpublished = {};
    window.__nativeUploadAssets = [];
    let assetCaptureInstalled = false;
    let cms;
    Object.defineProperty(window, 'CMS', {
      configurable: true,
      get: () => cms,
      set(value) {
        cms = value;
        const originalInit = value.init.bind(value);
        value.init = options => {
          // Production custom.js has already validated its unchanged GitHub config.
          // Swap only this test page to Decap's official, browser-memory backend.
          if (!assetCaptureInstalled) {
            const backend = value.getBackend('test-repo').BackendClass;
            const persistEntry = backend.prototype.persistEntry;
            backend.prototype.persistEntry = function(entry, persistOptions) {
              // Keep the real AssetProxy before test-repo normalizes it into
              // plain media records, which otherwise skip GitHub serialization.
              window.__nativeUploadAssets.push(...(entry.assets || []));
              return persistEntry.call(this, entry, persistOptions);
            };
            assetCaptureInstalled = true;
          }
          window.__productionCmsConfig = { ...options.config.backend };
          window.__memoryCmsActive = true;
          return originalInit({ ...options, config: { ...options.config, backend: { ...options.config.backend, name: 'test-repo', login: true } } });
        };
      }
    });
  }, { repoTree });
}
async function draftRecord(page, title) {
  return page.evaluate(title => {
    const entries = Object.values(window.repoFilesUnpublished || {});
    const record = entries.find(entry => entry.diffs.some(diff => typeof diff.content === 'string' && diff.content.includes(title)));
    if (!record) return null;
    return { slug: record.slug, status: record.status, raw: record.diffs.find(diff => typeof diff.content === 'string')?.content, assetCount: record.diffs.filter(diff => diff.content?.fileObj).length };
  }, title);
}
async function publishedRecord(page, title) {
  return page.evaluate(title => Object.values(window.repoFiles?.content?.posts || {}).find(file => typeof file.content === 'string' && file.content.includes(title))?.content || null, title);
}

test('the unmodified CMS boots the Turkish GitHub login with the production admin CSP', async ({ page, request }, testInfo) => {
  const errors = await monitor(page);
  const response = await page.goto('/admin/');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.getByRole('button', { name: 'GitHub ile Giriş', exact: true })).toBeVisible();
  await expect(page.locator('#cms-startup')).toBeHidden();
  const config = await (await request.get('/admin/config.json')).json();
  expect(config.backend).toMatchObject({ name: 'github', repo: 'esakbas/hindiba-blog', branch: 'main', auth_scope: 'repo', open_authoring: false });
  expect(config.publish_mode).toBe('editorial_workflow');
  expect(config.media_processing.enabled).toBe(false);
  expect(await page.evaluate(() => window.__memoryCmsActive || false)).toBe(false);
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('github-login.png'), fullPage: true });
  await assertHealthy(page, errors);
});

test('the native CMS edits, previews, uploads original bytes and runs draft/publish/unpublish in its isolated memory backend', async ({ page, request }, testInfo) => {
  const errors = await monitor(page);
  const seed = await (await request.get('/__fixtures/repo.json')).json();
  const productionConfig = await (await request.get('/admin/config.json')).json();
  await memoryBackend(page, seed);
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'Giriş', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Giriş', exact: true }).click();
  await expect(page.locator('a[href="#/collections/posts/entries/github-6210660748"]')).toContainText(realTitle);
  await page.getByLabel('Yazı türünde girdi oluştur', { exact: true }).click();
  const suffix = randomUUID().slice(0, 8);
  const title = `Tarayıcı masası ${suffix}`;
  const slug = `tarayici-masasi-${suffix}`;
  await page.getByLabel(/^Başlık/).fill(title);
  await page.getByLabel(/^Kısa açıklama/).fill('Yalnızca tarayıcı belleğinde saklanan test yazısı.');
  await page.getByLabel(/^Yazı adresi/).fill(slug);
  await page.getByLabel(/^Kapak alternatif metni/).fill('Tarayıcı denemesi için üretilmiş fotoğraf');
  await expect.poll(async () => Number.isNaN(Date.parse((await editorData(page))?.created_at))).toBe(false);
  await assertNoOverflow(page);
  let raw = page.locator('.cms-editor-raw [data-slate-editor="true"]').first();
  await expect(raw).toBeVisible();
  await typeMarkdown(raw, '## Bir başlangıç\n\n**Kalın başlangıç** ve kelimeler.');
  await expect.poll(async () => (await editorData(page))?.body).toContain('**Kalın başlangıç**');
  await page.locator('.cms-editor-raw').getByLabel(/rich text|zengin/i).click();
  await expect(page.locator('.cms-editor-visual [data-slate-editor="true"]').first()).toBeVisible();
  await expect(page.locator('.cms-editor-visual strong').first()).toHaveText('Kalın başlangıç');
  await page.locator('.cms-editor-visual').getByLabel(/markdown mode|markdown.*geç/i).click();
  raw = page.locator('.cms-editor-raw [data-slate-editor="true"]').first();
  await expect(raw).toBeVisible();

  const original = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#5b8068' } }).png().toBuffer();
  const originalSha = createHash('sha256').update(original).digest('hex');
  await page.getByRole('button', { name: 'Bir resim seçin', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'browser-fixture.png', mimeType: 'image/png', buffer: original });
  await expect(page.getByRole('button', { name: 'Seçileni kullan', exact: true })).toBeEnabled();
  await assertNoOverflow(page);
  await page.getByRole('button', { name: 'Seçileni kullan', exact: true }).click();
  await expect.poll(async () => (await editorData(page))?.cover).toMatch(/^\/uploads\/browser-fixture\.png$/);
  await expect.poll(() => page.locator('#nc-root img').evaluateAll(images => images.some(img => img.naturalWidth === 640 && img.src.startsWith('blob:')))).toBe(true);
  const cover = (await editorData(page)).cover;
  const markdown = `## Bir başlangıç\n\n**Kalın başlangıç** ve kelimeler.\n\n![Birinci fotoğraf](${cover} "Birinci açıklama")\n\n![İkinci fotoğraf](${cover} "İkinci açıklama")`;
  await typeMarkdown(raw, markdown);
  await expect.poll(async () => (await editorData(page))?.body).toBe(markdown);
  const preview = page.frameLocator('iframe').locator('.hindiba-preview');
  await expect(preview.locator('h1')).toHaveText(title);
  await expect(preview.locator('.preview-cover img')).toHaveAttribute('alt', 'Tarayıcı denemesi için üretilmiş fotoğraf');
  await expect(preview.locator('.preview-prose img')).toHaveCount(2);
  await expect(preview.locator('.preview-prose figcaption')).toHaveText(['Birinci açıklama', 'İkinci açıklama']);
  await expect.poll(() => preview.locator('img').evaluateAll(images => images.map(img => ({ width: img.naturalWidth, source: img.getAttribute('src') })))).toEqual([
    { width: 640, source: expect.stringMatching(/^blob:/) },
    { width: 640, source: expect.stringMatching(/^blob:/) },
    { width: 640, source: expect.stringMatching(/^blob:/) }
  ]);
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect.poll(async () => (await draftRecord(page, title))?.status).toBe('draft');
  const draft = await draftRecord(page, title);
  expect(draft.raw).toContain('status: published');
  expect(draft.raw).toContain(slug);
  expect(draft.raw).toContain('Birinci açıklama');
  expect(draft.assetCount).toBe(1);
  expect(await publishedRecord(page, title)).toBeNull();
  const uploaded = await page.evaluate(async title => {
    const entry = Object.values(window.repoFilesUnpublished).find(entry => entry.diffs.some(diff => typeof diff.content === 'string' && diff.content.includes(title)));
    const file = entry.diffs.find(diff => diff.content?.fileObj)?.content.fileObj;
    if (!file) return null;
    const sha = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return { name: file.name, type: file.type, size: file.size, sha: [...new Uint8Array(sha)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
  }, title);
  expect(uploaded).toEqual({ name: 'browser-fixture.png', type: 'image/png', size: original.length, sha: originalSha });
  const nativeUpload = await page.evaluate(async productionConfig => {
    const asset = window.__nativeUploadAssets.find(asset => asset.fileObj?.name === 'browser-fixture.png');
    if (!asset || typeof asset.toBase64 !== 'function' || !asset.url?.startsWith('blob:')) {
      throw new Error('The native uploaded AssetProxy was not captured before normalization.');
    }
    const backend = window.CMS.getBackend('github').init(productionConfig, { useWorkflow: true, initialWorkflowStatus: 'draft' });
    const originalSha = asset.sha, hadSha = Object.hasOwn(asset, 'sha');
    const calls = [];
    let payload;
    backend.currentUser = async () => ({ login: 'esakbas', name: 'Offline browser fixture' });
    try {
      // The configured main branch lets authenticate create the native API
      // synchronously. Replace only its network boundary before it resumes.
      const authenticating = backend.authenticate({ token: 'offline-fake-test-token' });
      backend.api.request = async (path, options = {}) => {
        const method = options.method || 'GET';
        calls.push({ path, method });
        if (path === '/repos/esakbas/hindiba-blog' && method === 'GET') {
          return { owner: { login: 'esakbas' }, permissions: { push: true }, private: true };
        }
        if (path === '/repos/esakbas/hindiba-blog/git/blobs' && method === 'POST') {
          payload = JSON.parse(options.body);
          return { sha: '0123456789abcdef0123456789abcdef01234567' };
        }
        throw new Error('Unexpected request in the isolated native GitHub upload test.');
      };
      await authenticating;
      // Keep this native method and AssetProxy.toBase64 unmodified: their
      // fetch(blob:) must satisfy the real production admin connect-src CSP.
      await backend.api.uploadBlob(asset);
      return { payload, calls };
    } finally {
      if (hadSha) asset.sha = originalSha;
      else delete asset.sha;
      backend.logout();
    }
  }, productionConfig);
  expect(nativeUpload.calls).toEqual([
    { path: '/repos/esakbas/hindiba-blog', method: 'GET' },
    { path: '/repos/esakbas/hindiba-blog/git/blobs', method: 'POST' }
  ]);
  expect(nativeUpload.payload.encoding).toBe('base64');
  const nativeBytes = Buffer.from(nativeUpload.payload.content, 'base64');
  expect(nativeBytes.equals(original)).toBe(true);
  expect(createHash('sha256').update(nativeBytes).digest('hex')).toBe(originalSha);
  await expect.poll(() => preview.locator('img').evaluateAll(images => images.map(img => img.naturalWidth))).toEqual([640, 640, 640]);
  await page.screenshot({ path: testInfo.outputPath('cms-private-draft.png'), fullPage: true });
  await page.getByRole('button', { name: /^Durumu:/ }).click();
  await page.getByText('Hazır', { exact: true }).click();
  await expect.poll(async () => (await draftRecord(page, title))?.status).toBe('pending_publish');
  await page.getByRole('button', { name: 'Yayınla', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByText('Şimdi yayımla', { exact: true }).click();
  await expect.poll(() => publishedRecord(page, title)).toContain(title);
  await expect.poll(() => draftRecord(page, title)).toBeNull();
  await page.getByRole('button', { name: 'Yayınlanan', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByText('Yayından Kaldır', { exact: true }).click();
  await expect.poll(() => publishedRecord(page, title)).toBeNull();
  await expect.poll(async () => (await draftRecord(page, title))?.raw).toContain(title);
  expect(await page.evaluate(() => window.__productionCmsConfig.name)).toBe('github');
  await assertHealthy(page, errors);
});

test('the public-nine reader supports mobile layout, search, theme and legacy URLs without exposing a draft', async ({ page, request }, testInfo) => {
  const errors = await monitor(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: realTitle, exact: true })).toBeVisible();
  await expect(page.locator('.posts-list .post-card')).toHaveCount(6);
  await assertNoOverflow(page);
  expect(await page.content()).not.toContain(privateMarker);
  const search = await request.get('/assets/search-index.json');
  expect(await search.text()).not.toContain(privateMarker);
  expect((await request.get('/yazi/ozel-tarayici-taslagi/')).status()).toBe(404);
  await page.screenshot({ path: testInfo.outputPath('reader-home.png'), fullPage: true });
  await page.keyboard.press('/');
  await expect(page.locator('#search')).toBeFocused();
  await page.locator('#search').fill('Van akşamı');
  await page.locator('#search').press('Enter');
  await expect(page.locator('.posts-list .post-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: realTitle, exact: true })).toBeVisible();
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('nav[aria-label="Ana gezinme"] a[href="/arsiv/"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hatırlamak için.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reader-archive-dark.png'), fullPage: true });
  await page.goto('/#post-6210660748');
  await expect(page).toHaveURL(/\/yazi\/yine-bir-van-aksami-yine-sonbahar\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(realTitle);
  await assertNoOverflow(page);
  await assertHealthy(page, errors);
});
