import { test, expect } from '@playwright/test';

// This suite uses only the immutable public-nine fixture served by
// scripts/browser-fixture.js. It never reads the editor's private content tree.
const newestTitle = 'Yine bir Van akşamı, yine sonbahar…';
const newestPath = '/yazi/yine-bir-van-aksami-yine-sonbahar/';
const oldestTitle = 'Gülün Ahı';
const letterTitle = 'Özlenene Mektup';
const publicTitles = [
  newestTitle, 'Mazi', letterTitle, 'Huysuzluk ve Ben', "Sabah'ın Yükü",
  'Belki de onu son defa görmemdi… ya da sonumdu.', 'Bir Haziran Mevzusu...', '...', oldestTitle,
];
const privateMarker = 'HINDIBA_CI_ONLY_PRIVATE_DRAFT_40d9857d';
const titles = page => page.locator('.posts-list h3 a');
const pagination = page => page.getByRole('navigation', { name: 'Sayfalama', exact: true });
const locationOf = page => new URL(page.url());

async function observeReader(page) {
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  page.on('response', response => {
    const request = response.request();
    const local = new URL(response.url()).origin === 'http://127.0.0.1:4173';
    if (local && response.status() >= 400 && ['script', 'stylesheet', 'image'].includes(request.resourceType())) {
      problems.push(`${response.status()} ${request.resourceType()} ${new URL(response.url()).pathname}`);
    }
  });
  // An audit must not accidentally follow a social link or contact GitHub.
  await page.route('https://**/*', route => route.abort('blockedbyclient'));
  return problems;
}
async function noOverflow(page) {
  const measured = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  expect(measured.document, `horizontal overflow at ${measured.viewport}px on ${new URL(page.url()).pathname}`).toBeLessThanOrEqual(measured.viewport + 1);
}
async function loadedImages(page) {
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0), {
      message: `the reader image must decode: ${await image.getAttribute('src')}`,
    }).toBe(true);
  }
}
async function parsedXml(page, source, selector) {
  return page.evaluate(({ source, selector }) => {
    const document = new DOMParser().parseFromString(source, 'application/xml');
    return { errors: document.querySelectorAll('parsererror').length, values: [...document.querySelectorAll(selector)].map(node => node.textContent) };
  }, { source, selector });
}

test('readers can page through every original article and refresh a physical later page', async ({ page }, testInfo) => {
  const problems = await observeReader(page);
  expect((await page.goto('/')).status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(titles(page)).toHaveCount(6);
  await expect(titles(page).first()).toHaveText(newestTitle);
  const first = await titles(page).allTextContents();
  const firstLinks = await titles(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reader-audit-list-dark.png'), fullPage: true });

  await pagination(page).getByRole('link', { name: '02', exact: true }).click();
  await expect(page).toHaveURL(/\/sayfa\/2\/$/);
  await expect(titles(page)).toHaveCount(3);
  const second = await titles(page).allTextContents();
  const secondLinks = await titles(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  expect([...first, ...second]).toEqual(publicTitles);
  expect(new Set([...firstLinks, ...secondLinks]).size).toBe(9);
  expect((await page.reload()).status()).toBe(200);
  await expect(titles(page)).toHaveText(second);
  await expect(pagination(page).getByRole('link', { name: '02', exact: true })).toHaveAttribute('aria-current', 'page');

  await titles(page).filter({ hasText: oldestTitle }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(oldestTitle);
  await expect(page.locator('#article-body')).not.toBeEmpty();
  await noOverflow(page);
  expect(problems).toEqual([]);
});

test('category and article tag links retain the real multi-category writing', async ({ page }) => {
  const problems = await observeReader(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Kategoriler', exact: true }).getByRole('link', { name: 'Edebiyat', exact: true }).click();
  await expect(page).toHaveURL(/\/kategori\/edebiyat\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edebiyat');
  await expect(titles(page)).toHaveCount(2);
  expect(new Set(await titles(page).allTextContents())).toEqual(new Set([letterTitle, '...']));
  await titles(page).filter({ hasText: letterTitle }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(letterTitle);
  await page.locator('.article-tags').getByRole('link', { name: '#Günlük', exact: true }).click();
  await expect(page).toHaveURL(/\/etiket\/gunluk\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Günlük');
  await expect(titles(page)).toHaveCount(6);
  expect(await titles(page).allTextContents()).toContain(letterTitle);
  expect(await titles(page).allTextContents()).toContain(newestTitle);
  expect(await titles(page).allTextContents()).not.toContain(oldestTitle);
  expect((await page.reload()).status()).toBe(200);
  await expect(titles(page)).toHaveCount(6);
  await noOverflow(page);
  expect(problems).toEqual([]);
});

test('search, year and sort survive refresh, dynamic later pages work and clearing restores the list', async ({ page }) => {
  const problems = await observeReader(page);
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Yazılarda ara', exact: true })).toBeFocused();
  const search = page.getByRole('searchbox', { name: 'Yazılarda ara', exact: true });
  await search.fill('VAN AKŞAMI');
  await page.getByLabel('Yıl', { exact: true }).selectOption('2026');
  await page.getByLabel('Sıralama', { exact: true }).selectOption('eski');
  await page.getByRole('button', { name: 'Uygula', exact: true }).click();
  await expect(titles(page)).toHaveText([newestTitle]);
  expect(locationOf(page).searchParams.get('q')).toBe('VAN AKŞAMI');
  expect(locationOf(page).searchParams.get('yil')).toBe('2026');
  expect(locationOf(page).searchParams.get('sira')).toBe('eski');
  await expect(page.locator('#search-results-status')).toContainText('1 yazı bulundu');
  await page.reload();
  await expect(titles(page)).toHaveText([newestTitle]);
  await expect(search).toHaveValue('VAN AKŞAMI');
  await expect(page.getByLabel('Yıl', { exact: true })).toHaveValue('2026');
  await expect(page.getByLabel('Sıralama', { exact: true })).toHaveValue('eski');

  await search.clear();
  await page.getByLabel('Yıl', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Uygula', exact: true }).click();
  await expect(titles(page)).toHaveCount(6);
  await expect(titles(page).first()).toHaveText(oldestTitle);
  await expect(page.locator('.section-heading h2')).not.toContainText('VAN AKŞAMI');
  await pagination(page).getByRole('link', { name: '02', exact: true }).click();
  await expect(titles(page)).toHaveCount(3);
  await expect(titles(page).last()).toHaveText(newestTitle);
  await page.reload();
  await expect(titles(page)).toHaveCount(3);
  await expect(titles(page).last()).toHaveText(newestTitle);

  await page.getByRole('navigation', { name: 'Kategoriler', exact: true }).getByRole('link', { name: /^Tümü/ }).click();
  await expect(titles(page).first()).toHaveText(newestTitle);
  await expect(page.getByLabel('Yıl', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Sıralama', { exact: true })).toHaveValue('yeni');
  expect(locationOf(page).search).toBe('');
  await search.fill('eşleşmeyen-okuyucu-audit-9f26a1');
  await search.press('Enter');
  await expect(titles(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bu aramada bir yazı bulunamadı.', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Filtreleri temizle →', exact: true }).click();
  await expect(titles(page)).toHaveCount(6);
  await expect(titles(page).first()).toHaveText(newestTitle);
  await noOverflow(page);
  expect(problems).toEqual([]);
});

test('bookmarks, continued reading and reading size work across page visits', async ({ page }, testInfo) => {
  const problems = await observeReader(page);
  await page.goto(newestPath);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(newestTitle);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const fontSize = () => page.locator('#article-body').evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
  const initialSize = await fontSize();
  await page.getByRole('button', { name: 'Yazıyı büyüt', exact: true }).click();
  await expect.poll(fontSize).toBeGreaterThan(initialSize);
  const largerSize = await fontSize();
  await page.reload();
  expect(await fontSize()).toBeCloseTo(largerSize, 1);
  await page.getByRole('button', { name: 'Yazıyı küçült', exact: true }).click();
  await expect.poll(fontSize).toBeLessThan(largerSize);
  const bookmark = page.locator('#save-post');
  await expect(bookmark).toHaveAttribute('aria-pressed', 'false');
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reader-audit-article-dark.png'), fullPage: true });

  await page.locator('.back-link').click();
  await expect(page.locator('#continue-reading')).toBeVisible();
  await expect(page.locator('#last-read-link')).toHaveText(newestTitle);
  await page.locator('#last-read-link').click();
  await expect(page).toHaveURL(new RegExp(newestPath + '$'));
  await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.back-link').click();
  await page.locator('#saved-filter').click();
  await expect(titles(page)).toHaveText([newestTitle]);
  await titles(page).first().click();
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.back-link').click();
  await page.locator('#saved-filter').click();
  await expect(titles(page)).toHaveCount(0);
  await expect(page.locator('.empty-state')).toBeVisible();
  expect(problems).toEqual([]);
});

test('archive, about, RSS, sitemap and social metadata all point to the public writing', async ({ page, request }) => {
  const problems = await observeReader(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ana gezinme', exact: true }).getByRole('link', { name: 'Arşiv', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hatırlamak için.');
  const archiveLinks = page.locator('.archive a[href^="/yazi/"]');
  await expect(archiveLinks).toHaveCount(9);
  await archiveLinks.filter({ hasText: oldestTitle }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(oldestTitle);
  await page.getByRole('navigation', { name: 'Ana gezinme', exact: true }).getByRole('link', { name: 'Hakkımda', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Merhaba, ben Eşref.');
  await loadedImages(page);
  const social = await page.locator('.social-links a').evaluateAll(nodes => nodes.map(node => ({ url: node.href, rel: node.rel })));
  expect(social.some(link => link.url.startsWith('https://www.instagram.com/esrefakbs'))).toBe(true);
  expect(social.every(link => link.rel.includes('noopener'))).toBe(true);

  await page.goto(newestPath);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toBe(locationOf(page).origin + newestPath);
  await expect(page).toHaveTitle(new RegExp('Yine bir Van akşamı, yine sonbahar…'));
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', new RegExp('Yine bir Van akşamı'));
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
  expect((await page.locator('meta[name="description"]').getAttribute('content')).length).toBeGreaterThan(30);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const structured = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(structured['@type']).toBe('BlogPosting');
  expect(structured.headline).toBe(newestTitle);
  expect(Date.parse(structured.datePublished)).toBeGreaterThan(0);
  const socialImage = new URL(await page.locator('meta[property="og:image"]').getAttribute('content'));
  expect(socialImage.origin).toBe(locationOf(page).origin);
  const imageResponse = await request.get(socialImage.href);
  expect(imageResponse.status()).toBe(200);
  expect(imageResponse.headers()['content-type']).toMatch(/^image\//);

  const rssResponse = await request.get('/rss.xml');
  expect(rssResponse.status()).toBe(200);
  const rss = await rssResponse.text();
  const feedTitles = await parsedXml(page, rss, 'item > title');
  expect(feedTitles.errors).toBe(0);
  expect(feedTitles.values).toEqual(publicTitles);
  expect(rss).not.toContain(privateMarker);
  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.status()).toBe(200);
  const sitemapText = await sitemapResponse.text();
  const sitemap = await parsedXml(page, sitemapText, 'url > loc');
  expect(sitemap.errors).toBe(0);
  expect(sitemap.values.filter(url => new URL(url).pathname.startsWith('/yazi/'))).toHaveLength(9);
  expect(sitemap.values).toContain(canonical);
  expect(sitemap.values.some(url => /\/admin|\/auth|\/callback|ozel-tarayici-taslagi/.test(new URL(url).pathname))).toBe(false);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /admin/');
  await noOverflow(page);
  expect(problems).toEqual([]);
});

test('skip navigation, keyboard theme activation and narrow/tablet layouts remain usable', async ({ page }, testInfo) => {
  const problems = await observeReader(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'İçeriğe geç', exact: true })).toBeFocused();
  const theme = page.locator('#theme-toggle');
  await theme.focus();
  await expect(theme).toBeFocused();
  await theme.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(theme).toHaveAttribute('aria-label', 'Koyu temaya geç');
  await theme.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme).toHaveAttribute('aria-label', 'Açık temaya geç');
  await page.keyboard.press('/');
  const search = page.getByRole('searchbox', { name: 'Yazılarda ara', exact: true });
  await expect(search).toBeFocused();
  await search.fill('A');
  await search.press('/');
  await expect(search).toHaveValue('A/');

  const viewports = testInfo.project.name.startsWith('desktop')
    ? [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]
    : [{ width: 320, height: 740 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of ['/', newestPath, '/hakkinda/']) {
      await test.step(`${viewport.width}px ${route}`, async () => {
        expect((await page.goto(route)).status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await noOverflow(page);
        if (viewport.width === 768 && route === '/hakkinda/') {
          await loadedImages(page);
          await page.screenshot({ path: testInfo.outputPath('reader-audit-about-tablet-dark.png'), fullPage: true });
        }
      });
    }
  }
  expect(problems).toEqual([]);
});

test('reader pages load real image assets and every discovered local navigation target exists', async ({ page, request }) => {
  const problems = await observeReader(page);
  const targets = new Set();
  for (const route of ['/', '/sayfa/2/', '/kategori/edebiyat/', '/etiket/gunluk/', '/arsiv/', '/hakkinda/', '/ara/', newestPath]) {
    expect((await page.goto(route)).status()).toBe(200);
    await loadedImages(page);
    const references = await page.evaluate(() => [...document.querySelectorAll('a[href],img[src],script[src],link[rel="stylesheet"],link[rel="icon"]')].map(node => node.getAttribute('href') || node.getAttribute('src')).filter(Boolean));
    for (const reference of references) {
      if (reference.startsWith('#')) continue;
      const target = new URL(reference, page.url());
      if (target.origin !== locationOf(page).origin || /^\/(admin|auth|callback)(\/|$)/.test(target.pathname)) continue;
      target.hash = '';
      targets.add(target.href);
    }
    expect(await page.locator('main').textContent()).not.toContain(privateMarker);
    await noOverflow(page);
  }
  const checked = await Promise.all([...targets].map(async target => {
    const response = await request.get(target);
    return { url: target, status: response.status(), bytes: (await response.body()).length };
  }));
  expect(checked.filter(target => target.status !== 200 || target.bytes === 0)).toEqual([]);
  expect(checked.filter(target => new URL(target.url).pathname.startsWith('/yazi/'))).toHaveLength(9);
  expect(problems).toEqual([]);
});

test('search inside saved writing never widens the view to unbookmarked articles', async ({ page }) => {
  const problems = await observeReader(page);
  await page.goto(newestPath);
  await page.locator('#save-post').click();
  await expect(page.locator('#save-post')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.back-link').click();
  await page.locator('#saved-filter').click();
  await expect(titles(page)).toHaveText([newestTitle]);
  const savedIds = locationOf(page).searchParams.get('kayitlar');
  expect(savedIds).toBeTruthy();
  const search = page.getByRole('searchbox', { name: 'Yazılarda ara', exact: true });
  await search.fill(oldestTitle);
  await search.press('Enter');
  await expect(titles(page)).toHaveCount(0);
  expect(locationOf(page).searchParams.get('kayitlar')).toBe(savedIds);
  await expect(page.locator('.empty-state')).toBeVisible();
  await search.clear();
  await search.press('Enter');
  await expect(titles(page)).toHaveText([newestTitle]);
  expect(locationOf(page).searchParams.get('kayitlar')).toBe(savedIds);
  await page.reload();
  await expect(titles(page)).toHaveText([newestTitle]);
  expect(problems).toEqual([]);
});

test('table of contents preserves author anchors and avoids generated id collisions', async ({ page }) => {
  const problems = await observeReader(page);
  // Add only harmless synthetic heading markup to the public article response.
  // The real bundled reader.js then creates its TOC; no server file is changed.
  const fixture = '<h2 id="ozel">Özel bölüm</h2><p><a id="reader-audit-anchor" href="#ozel">Kaynak bağlantısı</a></p><h2 id="bolum-2">İkinci bölüm</h2><h3>Üçüncü bölüm</h3>';
  await page.route(`**${newestPath}`, async route => {
    const response = await route.fetch();
    const original = await response.text();
    const body = original.replace(/(<div\b[^>]*\bid="article-body"[^>]*>)/, '$1' + fixture);
    if (body === original) throw new Error('The public article fixture has no reading body.');
    await route.fulfill({ response, body });
  });
  await page.goto(newestPath);
  const toc = page.getByRole('navigation', { name: 'İçindekiler', exact: true });
  await expect(toc).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Özel bölüm', exact: true })).toHaveAttribute('id', 'ozel');
  await expect(page.getByRole('heading', { name: 'İkinci bölüm', exact: true })).toHaveAttribute('id', 'bolum-2');
  const headingIds = await page.locator('#article-body h2,#article-body h3').evaluateAll(nodes => nodes.map(node => node.id));
  expect(headingIds.every(Boolean)).toBe(true);
  expect(new Set(headingIds).size).toBe(headingIds.length);
  await expect(toc.getByRole('link', { name: 'Özel bölüm', exact: true })).toHaveAttribute('href', '#ozel');
  await page.getByRole('link', { name: 'Kaynak bağlantısı', exact: true }).click();
  await expect.poll(() => locationOf(page).hash).toBe('#ozel');
  const third = toc.getByRole('link', { name: 'Üçüncü bölüm', exact: true });
  const thirdTarget = await third.getAttribute('href');
  expect(thirdTarget).not.toBe('#ozel');
  expect(thirdTarget).not.toBe('#bolum-2');
  await third.click();
  await expect.poll(() => locationOf(page).hash).toBe(thirdTarget);
  await noOverflow(page);
  expect(problems).toEqual([]);
});
