import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, cp, rm, rename, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import sharp from 'sharp';
import { loadPosts } from '../src/content.js';
import { buildMedia } from '../src/media.js';
import { renderPage, postCard } from '../src/render.js';

const root = resolve(import.meta.dirname, '..');
const escape = s => String(s ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function safeSiteUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('SITE_URL tam kök HTTP(S) adresi olmalı.');
  return parsed.origin;
}
function staticLink(link) {
  if (!link.startsWith('/') || link.startsWith('//') || link.startsWith('/uploads/')) return link;
  const u = new URL(link, 'https://site.invalid');
  if (u.searchParams.has('sayfa')) {
    const n = Number(u.searchParams.get('sayfa'));u.searchParams.delete('sayfa');
    if (n > 1) u.pathname = u.pathname.replace(/\/$/, '') + `/sayfa/${n}/`;
  }
  if (!u.pathname.endsWith('/') && !u.pathname.split('/').at(-1).includes('.')) u.pathname += '/';
  return u.pathname + u.search + u.hash;
}
function staticHtml(html, origin) {
  return html.replace(/(href|action)="([^"]+)"/g, (_, kind, value) => `${kind}="${staticLink(value)}"`)
    .replaceAll(origin + '/?sayfa=', origin + '/sayfa/');
}
async function outputPage(output, path, html) {
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { throw new Error('Çıktı adresi geçersiz.'); }
  if (decoded.split('/').some(s => ['.', '..'].includes(s)) || decoded.includes('\0')) throw new Error('Çıktı yolu güvenli değil.');
  const target = resolve(output, '.' + decoded, 'index.html');
  if (!target.startsWith(output + sep)) throw new Error('Çıktı yolu dışarı çıkıyor.');
  await mkdir(dirname(target), { recursive: true });await writeFile(target, html);
}
async function commitOutput(staging, output) {
  const old = output + '.previous-' + process.pid;
  let moved = false;
  try {
    if (existsSync(output)) { await rename(output, old);moved = true; }
    await rename(staging, output);
    if (moved) await rm(old, { recursive: true, force: true });
  } catch (error) {
    if (moved && !existsSync(output)) await rename(old, output);
    throw error;
  }
}
export async function buildSite(options = {}) {
  const output = resolve(options.outputDir || '_site');
  const branch = options.branch ?? process.env.CF_PAGES_BRANCH ?? 'main';
  const productionBranch = 'main';
  const siteUrl = safeSiteUrl(options.siteUrl || process.env.SITE_URL || 'http://localhost:3000');
  if (process.env.CF_PAGES && (!process.env.SITE_URL || !siteUrl.startsWith('https:'))) throw new Error('Cloudflare Production ortamına gerçek HTTPS SITE_URL değerini ekleyin.');
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(join(dirname(output), '.hindiba-build-'));
  try {
    if (branch !== productionBranch) {
      const guard = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Özel çalışma dalı</title></head><body><p>Bu çalışma dalının içeriği yayımlanmaz.</p></body></html>';
      await writeFile(join(staging, 'index.html'), guard);
      await writeFile(join(staging, '404.html'), guard);
      await writeFile(join(staging, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
      await writeFile(join(staging, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n');
      await commitOutput(staging, output);
      return { publishedPosts: 0, sourcePosts: 0, outputDir: output, guardedBranch: true };
    }
    const all = loadPosts(resolve(options.contentDir || 'content/posts'));
    const published = all.filter(p => p.status === 'published').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const mapping = await buildMedia(published, resolve(options.mediaDir || 'content/media'), staging);
    const posts = published.map(p => ({ ...p, cover: mapping[p.cover] || mapping[p.cover.split(/[?#]/)[0]] || p.cover }));
    // Only this audited public directory is copied. Never copy content/, work/, env or functions source.
    await cp(join(root, 'public'), staging, { recursive: true });
    process.env.XDG_CACHE_HOME ||= join(root, 'work', '.cache');await mkdir(process.env.XDG_CACHE_HOME, { recursive: true });
    await sharp(join(root, 'public/social.svg')).resize(1200, 630).jpeg({ quality: 85 }).toFile(join(staging, 'social.jpg'));
    const redirects = [], currentSlugs = new Set(posts.map(p => p.slug)), usedAliases = new Set();
    for (const post of posts) for (const alias of post.aliases || []) {
      if (alias === post.slug) continue;
      if (currentSlugs.has(alias) || usedAliases.has(alias)) throw new Error('Eski yazı adresi başka bir yazıyla çakışıyor.');
      usedAliases.add(alias);redirects.push(`/yazi/${alias}/ /yazi/${post.slug}/ 301`);
    }
    await writeFile(join(staging, '_redirects'), redirects.join('\n') + (redirects.length ? '\n' : ''));
    const generated = [];
    const render = async (route, pathname, query = {}, post = null) => {
      const canonical = siteUrl + route;
      let html = renderPage({ pathname, query, posts, post, comments: [], siteUrl, imageMap: mapping });
      html = staticHtml(html, siteUrl).replace(/(<link rel="canonical" href=")[^"]+("\s*\/?>)/, `$1${canonical}$2`)
        .replace(/(<meta property="og:url" content=")[^"]+("\s*\/?>)/, `$1${canonical}$2`);
      await outputPage(staging, route, html);generated.push({ path: route, updated: post?.updated_at });
    };
    await render('/', '/');
    for (let page = 2; page <= Math.ceil(posts.length / 6); page++) await render(`/sayfa/${page}/`, '/', { sayfa: String(page) });
    await render('/arsiv/', '/arsiv');await render('/hakkinda/', '/hakkinda');await render('/ara/', '/ara');
    for (const post of posts) await render(`/yazi/${post.slug}/`, `/yazi/${post.slug}`, {}, post);
    for (const kind of ['kategori', 'etiket']) {
      const values = [...new Set(kind === 'kategori' ? [...['edebiyat', 'siir', 'gunluk', 'bir-cumle'], ...posts.map(p => p.category)] : posts.flatMap(p => p.tags))];
      for (const value of values) {
        const route = `/${kind}/${encodeURIComponent(value)}/`, pathname = route.replace(/\/$/, '');
        const matching = posts.filter(p => kind === 'kategori' ? p.category === value || p.tags.includes(value) : p.tags.includes(value));
        await render(route, pathname);
        for (let page = 2; page <= Math.ceil(matching.length / 6); page++) await render(`${route}sayfa/${page}/`, pathname, { sayfa: String(page) });
      }
    }
    await writeFile(join(staging, '404.html'), staticHtml(renderPage({ pathname: '/404', posts, siteUrl }), siteUrl));
    const assets = join(staging, 'assets');await mkdir(assets, { recursive: true });
    await writeFile(join(assets, 'legacy.json'), JSON.stringify({ map: Object.fromEntries(posts.filter(p => p.legacy_id).map(p => [p.legacy_id, `/yazi/${p.slug}/`])) }));
    await writeFile(join(assets, 'search-index.json'), JSON.stringify(posts.map((p, i) => ({ id: p.legacy_id || p.id, title: p.title, body: p.body, category: p.category, tags: p.tags, created_at: p.created_at, url: `/yazi/${p.slug}/`, html: staticHtml(postCard(p, i), siteUrl) }))));
    await cp(join(root, 'admin'), join(staging, 'admin'), { recursive: true });
    const adminConfigPath = join(staging, 'admin/config.yml');
    const configText = (await readFile(adminConfigPath, 'utf8')).replaceAll('__SITE_URL__', siteUrl).replaceAll('__SITE_HOST__', new URL(siteUrl).host).replaceAll('__REPOSITORY__', process.env.GITHUB_REPOSITORY || 'esakbas/hindiba-blog');
    const config = parseYaml(configText);
    await writeFile(adminConfigPath, configText);await writeFile(join(staging, 'admin/config.json'), JSON.stringify(config));
    const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Hindiba | Eşref Akbaş</title><link>${escape(siteUrl)}</link><description>Edebiyat, şiir ve gündelik hayattan küçük notlar.</description><language>tr</language>${posts.map(p => `<item><title>${escape(p.title)}</title><link>${escape(siteUrl)}/yazi/${escape(p.slug)}/</link><guid isPermaLink="false">hindiba:${escape(p.id)}</guid><pubDate>${escape(new Date(p.created_at).toUTCString())}</pubDate><description>${escape(p.excerpt || p.body.slice(0, 300))}</description><dc:creator>${escape(p.author)}</dc:creator></item>`).join('')}</channel></rss>`;
    await writeFile(join(staging, 'rss.xml'), rss);
    await writeFile(join(staging, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${generated.filter(p => p.path !== '/ara/').map(p => `<url><loc>${escape(siteUrl + p.path)}</loc>${p.updated ? `<lastmod>${escape(p.updated)}</lastmod>` : ''}</url>`).join('')}</urlset>`);
    await writeFile(join(staging, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /auth\nDisallow: /callback\nSitemap: ${siteUrl}/sitemap.xml\n`);
    await writeFile(join(staging, '_routes.json'), JSON.stringify({ version: 1, include: ['/auth', '/callback'], exclude: [] }));
    await writeFile(join(staging, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/admin/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' https://api.github.com https://github.com https://*.githubusercontent.com; font-src 'self' data:; worker-src 'self' blob:; frame-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://github.com\n/vendor/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
    await commitOutput(staging, output);
    return { publishedPosts: posts.length, sourcePosts: all.length, outputDir: output, guardedBranch: false };
  } catch (error) { await rm(staging, { recursive: true, force: true });throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await buildSite(), null, 2)); }
  catch (error) { console.error(error.message);process.exitCode = 1; }
}
