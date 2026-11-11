import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

// Only the disposable server in scripts/test-server.js accepts these credentials.
const username = 'editor';
const password = process.env.E2E_PASSWORD || 'Browser-fixture-only!2026';
const existingArticle = 'Yine bir Van akşamı, yine sonbahar…';

async function login(page) {
  await page.goto('/admin');
  await expect(page.locator('#login-view')).toBeVisible();
  await page.getByLabel('Kullanıcı adı', { exact: true }).fill(username);
  await page.getByLabel('Parola', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Güvenli giriş' }).click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#posts-list')).toContainText(existingArticle);
}
async function saveWith(page, buttonId, method) {
  const response = page.waitForResponse(response => response.request().method() === method && /\/api\/admin\/posts(?:\/[^/]+)?$/.test(new URL(response.url()).pathname));
  await page.locator(buttonId).click();
  const saved = await response;
  expect(saved.ok(), `Save failed: ${saved.status()} ${await saved.text()}`).toBeTruthy();
  const result = await saved.json();
  await expect(page.locator('#save-state')).toContainText('Kaydedildi');
  await expect(page.locator(buttonId)).toBeEnabled();
  return result.post;
}
async function fixtureImage(name, background) {
  const buffer = await sharp({ create: { width: 600, height: 360, channels: 3, background } }).png().toBuffer();
  return { name, mimeType: 'image/png', buffer };
}
async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
}
async function upload(page, files, alt, caption) {
  await page.locator('#upload-files').setInputFiles(files);
  await page.locator('#upload-alt').fill(alt);
  await page.locator('#upload-caption').fill(caption);
  await page.locator('#upload-submit').click();
  await expect(page.locator('#media-status')).toContainText(`${files.length} fotoğraf yüklendi ve seçildi.`);
}

test('login, draft, preview, multi-image upload, publication and unpublication work through the panel', async ({ page, browser, baseURL }, testInfo) => {
  await login(page);
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('admin-posts.png'), fullPage: true });
  await page.locator('#new-post').click();
  const title = `Tarayıcı akışı ${randomUUID().slice(0, 8)}`;
  const slug = `tarayici-akisi-${randomUUID().slice(0, 8)}`;
  await page.locator('#post-title').fill(title);
  await page.locator('#post-slug').fill(slug);
  await page.locator('#post-excerpt').fill('Yalnızca geçici tarayıcı test veritabanında oluşturulan yazı.');
  await page.locator('#post-body').fill('## Bir başlangıç\n\nBu yazı tarayıcı akışını doğrular.\n\n**Kelimeler** burada.');
  await page.locator('#post-category').fill('gunluk');
  await page.locator('#post-tags').fill('tarayıcı, doğrulama');
  const draft = await saveWith(page, '#save-post', 'POST');
  expect(draft.status).toBe('draft');
  await expect(page.locator('#post-status')).toHaveText('Taslak');
  const visitorContext = await browser.newContext({ baseURL, viewport: testInfo.project.use.viewport });
  const visitor = await visitorContext.newPage();
  try {
    const hiddenDraft = await visitor.goto(`/yazi/${slug}`);
    expect(hiddenDraft.status()).toBe(404);
    await page.locator('#preview-post').click();
    await expect(page.locator('#preview-dialog')).toBeVisible();
    await expect(page.locator('#preview-heading')).toHaveText(title);
    await expect(page.locator('#preview-content')).toContainText('Bu yazı tarayıcı akışını doğrular.');
    await expect(page.locator('#preview-content strong')).toHaveText('Kelimeler');
    await page.locator('.preview-close').click();

    const alt = `Tarayıcı denemesi için üretilmiş renkli görsel ${slug}`;
    const caption = 'Geçici test fotoğrafı açıklaması';
    const libraryResponse = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/admin/media');
    await page.locator('#choose-cover').click();
    await expect(page.locator('#media-dialog')).toBeVisible();
    const existingMediaCount = (await (await libraryResponse).json()).media.length;
    await expect(page.locator('#media-grid .media-tile')).toHaveCount(existingMediaCount);
    await upload(page, [await fixtureImage('first-fixture.png', '#527e6b'), await fixtureImage('second-fixture.png', '#b18a50')], alt, caption);
    await expect(page.locator('#media-grid .media-tile')).toHaveCount(existingMediaCount + 2);
    await expect(page.locator('#media-grid').getByRole('button', { name: alt, exact: true })).toHaveCount(2);
    await page.locator('#use-media').click();
    await expect(page.locator('#media-dialog')).not.toBeVisible();
    await expect(page.locator('#post-cover')).toHaveValue(/^\/uploads\/[a-f0-9-]+\.webp$/);
    await expect(page.locator('#post-cover-alt')).toHaveValue(alt);

    await page.locator('#insert-image').click();
    const tiles = page.locator('#media-grid').getByRole('button', { name: alt, exact: true });
    await expect(tiles).toHaveCount(2);
    await tiles.nth(0).click();
    await tiles.nth(1).click();
    await expect(page.locator('#selection-label')).toHaveText('2 fotoğraf seçildi.');
    await page.locator('#use-media').click();
    expect((await page.locator('#post-body').inputValue()).match(/!\[/g)).toHaveLength(2);
    await page.locator('#preview-post').click();
    await expect(page.locator('#preview-content img')).toHaveCount(2);
    await expect(page.locator('#preview-content figcaption')).toHaveText([caption, caption]);
    await page.locator('.preview-close').click();
    await assertNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('admin-editor.png'), fullPage: true });
    const published = await saveWith(page, '#publish-post', 'PUT');
    expect(published.status).toBe('published');
    expect(published.id).toBe(draft.id);
    await expect(page.locator('#post-status')).toHaveText('Yayında');

    const visible = await visitor.goto(`/yazi/${slug}`);
    expect(visible.status()).toBe(200);
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(visitor.locator('.article-cover img')).toHaveAttribute('alt', alt);
    await expect(visitor.locator('#article-body img')).toHaveCount(2);
    await expect(visitor.locator('#article-body figcaption')).toHaveText([caption, caption]);
    for (const image of await visitor.locator('.article img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBeTruthy();
    }
    await assertNoOverflow(visitor);
    await visitor.screenshot({ path: testInfo.outputPath('published-reader.png'), fullPage: true });
    const unpublished = await saveWith(page, '#unpublish-post', 'PUT');
    expect(unpublished.status).toBe('draft');
    const removed = await visitor.reload();
    expect(removed.status()).toBe(404);
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Bir sayfa eksik.');
  } finally {
    await visitorContext.close();
  }
});

test('rich editing preserves bold text, image alt text and a single caption on Markdown conversion', async ({ page }, testInfo) => {
  await login(page);
  await page.locator('#new-post').click();
  const title = `Zengin editör ${randomUUID().slice(0, 8)}`;
  await page.locator('#post-title').fill(title);
  await page.locator('#mode-rich').click();
  await expect(page.locator('#rich-warning')).toContainText('Markdown biçimlendirmesini değiştirebilir');
  await page.locator('#enable-rich').click();
  const editor = page.locator('.ql-editor');
  await expect(editor).toBeVisible();
  await editor.fill('Kalın bir başlangıç');
  await editor.press('ControlOrMeta+A');
  await page.locator('.ql-bold').click();
  await expect(editor.locator('strong')).toHaveText('Kalın bir başlangıç');
  await editor.press('ArrowRight');
  await page.locator('#insert-image').click();
  const alt = 'Zengin editör görseli';
  const caption = 'Zengin editör açıklaması';
  await upload(page, [await fixtureImage('rich-fixture.png', '#75825d')], alt, caption);
  await page.locator('#use-media').click();
  await expect(editor.locator('img')).toHaveAttribute('alt', alt);
  await expect(editor.locator('img')).toHaveAttribute('title', caption);
  await page.screenshot({ path: testInfo.outputPath('rich-editor.png'), fullPage: true });
  await page.locator('#mode-markdown').click();
  const markdown = await page.locator('#post-body').inputValue();
  expect(markdown).toContain('**Kalın bir başlangıç**');
  expect(markdown).toContain(`![${alt}]`);
  expect(markdown.match(new RegExp(caption, 'g'))).toHaveLength(1);
  await page.locator('#preview-post').click();
  await expect(page.locator('#preview-content figcaption')).toHaveText(caption);
  await page.locator('.preview-close').click();
  const saved = await saveWith(page, '#save-post', 'POST');
  expect(saved.body).toBe(markdown);
  await page.reload();
  await expect(page.locator('#posts-list')).toBeVisible();
  const savedTitleButton = page.locator('#posts-list .post-info h2').getByRole('button', { name: title, exact: true });
  await expect(savedTitleButton).toHaveCount(1);
  await savedTitleButton.click();
  await expect(page.locator('#post-body')).toHaveValue(markdown);
});

test('reader search, theme, archive and responsive layout use the real migrated articles', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: existingArticle, exact: true })).toBeVisible();
  await expect(page.locator('.posts-list .post-card')).toHaveCount(6);
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reader-home.png'), fullPage: true });
  await page.keyboard.press('/');
  await expect(page.locator('#search')).toBeFocused();
  await page.locator('#search').fill('Van akşamı');
  await page.locator('#search').press('Enter');
  await expect(page.locator('.posts-list .post-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: existingArticle, exact: true })).toBeVisible();
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('nav[aria-label="Ana gezinme"] a[href="/arsiv"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hatırlamak için.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.archive')).toContainText(existingArticle);
  await assertNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reader-archive-dark.png'), fullPage: true });
});
