import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, verifyPassword, hashPassword } from './db.js';
import { renderMarkdown } from './markdown.js';
import { renderPage } from './render.js';
export { renderMarkdown } from './markdown.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const xml = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
const parsePost = row => row ? { ...row, tags: JSON.parse(row.tags || '[]') } : null;
const parseMedia = row => row ? { ...row, url: `/uploads/${row.file_name}` } : null;
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function slugify(value) {
  return String(value).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150);
}
function text(value, field, max, required = false) {
  if (value === undefined || value === null) { if (required) fail(422, `${field} gerekli.`); return ''; }
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(422, `${field} geçersiz veya çok uzun.`);
  return value;
}
function safeImage(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2048) fail(422, 'Görsel adresi geçersiz.');
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value) || value === '/pp.jpg') return value;
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch {}
  fail(422, 'Görsel için yüklenen bir dosya veya HTTPS adresi kullanın.');
}
function validatePost(input, old) {
  const now = new Date().toISOString();
  const get = key => input[key] === undefined && old ? old[key] : input[key];
  const title = text(get('title'), 'Başlık', 300, true).trim();
  const slug = get('slug') || slugify(title) || `yazi-${randomBytes(4).toString('hex')}`;
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) fail(422, 'Yazı adresinde küçük harf, rakam ve tire kullanın.');
  const tags = get('tags') ?? [];
  if (!Array.isArray(tags) || tags.length > 30 || tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 80)) fail(422, 'Etiketler geçersiz.');
  const status = get('status') ?? 'draft';
  if (!['draft', 'published'].includes(status)) fail(422, 'Yayın durumu geçersiz.');
  const created = get('created_at') || old?.created_at || now;
  if (typeof created !== 'string' || !Number.isFinite(Date.parse(created))) fail(422, 'Yazı tarihi geçersiz.');
  return {
    title, slug, body: text(get('body') ?? '', 'Yazı', 2_000_000),
    excerpt: text(get('excerpt') ?? '', 'Kısa açıklama', 600),
    cover: safeImage(get('cover') ?? ''), cover_alt: text(get('cover_alt') ?? '', 'Kapak alternatif metni', 500),
    category: text(get('category') || 'gunluk', 'Kategori', 80, true).trim(),
    tags: [...new Set(tags.map(t => t.trim()))], author: text(get('author') || 'Eşref Akbaş', 'Yazar', 160, true).trim(),
    created_at: old && created === old.created_at ? old.created_at : new Date(created).toISOString(),
    updated_at: new Date(Math.max(Date.now(), old ? Date.parse(old.updated_at) + 1 : 0)).toISOString(),
    published_at: status === 'published' ? (old?.published_at || now) : (old?.published_at || null), status
  };
}

export function createApp({ dataDir = process.env.DATA_DIR || join(root, 'data'), siteUrl = process.env.SITE_URL || 'http://localhost:3000', production = process.env.NODE_ENV === 'production', trustProxy = process.env.TRUST_PROXY === 'true' } = {}) {
  const canonicalUrl = new URL(siteUrl);
  if (!['http:', 'https:'].includes(canonicalUrl.protocol) || canonicalUrl.username || canonicalUrl.password) throw new Error('SITE_URL geçerli bir HTTP(S) adresi olmalı.');
  if (production && canonicalUrl.protocol !== 'https:') throw new Error('Üretimde HTTPS SITE_URL gerekli.');
  const siteOrigin = canonicalUrl.origin;
  siteUrl = siteUrl.replace(/\/$/, '');
  dataDir = resolve(dataDir);
  const uploads = join(dataDir, 'uploads');
  const originals = join(dataDir, 'originals');
  mkdirSync(uploads, { recursive: true, mode: 0o700 });
  mkdirSync(originals, { recursive: true, mode: 0o700 });
  const imageMapPath = join(dataDir, 'import-images.json');
  const imageMap = existsSync(imageMapPath) ? JSON.parse(readFileSync(imageMapPath, 'utf8')) : {};
  const db = openDatabase(dataDir);
  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy ? 1 : false);
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const originalSend = res.send.bind(res);
    res.send = function(body) {
      if (typeof body === 'string' && res.get('Content-Type')?.includes('text/html')) {
        const hashes = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(match => ` 'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`).join('');
        if (hashes) res.set('Content-Security-Policy', res.get('Content-Security-Policy').replace("script-src 'self'", "script-src 'self'" + hashes));
      }
      return originalSend(body);
    };
    next();
  });
  app.use(express.json({ limit: '3mb', strict: true }));
  const sessionCookie = production ? '__Host-hindiba_session' : 'hindiba_session';
  const clearCookie = res => res.clearCookie(sessionCookie, { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
  app.use((req, res, next) => {
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${sessionCookie}=`));
    const token = cookie?.slice(sessionCookie.length + 1);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const session = db.prepare('SELECT s.*, a.username FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE token_hash=? AND expires_at>?').get(hash(token), Date.now());
      if (session) req.adminSession = session;
    }
    next();
  });
  function originCheck(req, _res, next) {
    if (req.get('Origin') !== siteOrigin) return next(Object.assign(new Error('Bu işlem yalnızca kendi sitenizden yapılabilir.'), { status: 403 }));
    next();
  }
  function requireAdmin(req, _res, next) {
    if (!req.adminSession) return next(Object.assign(new Error('Yönetici girişi gerekli.'), { status: 401 }));
    next();
  }
  function requireCsrf(req, _res, next) {
    const token = Buffer.from(req.get('X-CSRF-Token') || '');
    const expected = Buffer.from(req.adminSession?.csrf_token || '');
    if (!expected.length || token.length !== expected.length || !timingSafeEqual(token, expected)) return next(Object.assign(new Error('Güvenlik doğrulaması başarısız. Sayfayı yenileyin.'), { status: 403 }));
    next();
  }
  app.get('/api/admin/session', (req, res) => res.json(req.adminSession ? { authenticated: true, csrfToken: req.adminSession.csrf_token, user: req.adminSession.username } : { authenticated: false }));
  app.post('/api/admin/login', originCheck, (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail(422, 'İstek verisi geçersiz.');
    const username = text(req.body.username, 'Kullanıcı adı', 100, true).trim();
    const password = text(req.body.password, 'Parola', 1024, true);
    const key = hash(`login:${req.ip}`);
    const now = Date.now();
    const attempt = db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key);
    if (attempt && attempt.window_start > now - 900_000 && attempt.count >= 10) { res.set('Retry-After', '900'); fail(429, 'Çok fazla giriş denemesi. 15 dakika sonra yeniden deneyin.'); }
    const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
    const valid = verifyPassword(password, admin?.password_hash || dummyHash);
    if (!valid || !admin) {
      db.prepare(`INSERT INTO login_attempts(key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start>? THEN count+1 ELSE 1 END, window_start=CASE WHEN window_start>? THEN window_start ELSE excluded.window_start END`).run(key, now, now - 900_000, now - 900_000);
      fail(401, 'Kullanıcı adı veya parola yanlış.');
    }
    db.prepare('DELETE FROM login_attempts WHERE key=? OR window_start<?').run(key, now - 900_000);
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now);
    if (req.adminSession) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.adminSession.token_hash);
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,admin_id,csrf_token,expires_at) VALUES(?,?,?,?)').run(hash(token), admin.id, csrfToken, now + 43_200_000);
    res.cookie(sessionCookie, token, { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: 43_200_000 });
    res.json({ authenticated: true, csrfToken, user: admin.username });
  });
  app.use('/api/admin', requireAdmin);
  app.use('/api/admin', (req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : originCheck(req, res, e => e ? next(e) : requireCsrf(req, res, next)));
  app.post('/api/admin/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.adminSession.token_hash);
    clearCookie(res); res.json({ ok: true });
  });
  app.get('/api/admin/posts', (_req, res) => res.json({ posts: db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all().map(parsePost) }));
  app.get('/api/admin/posts/:id', (req, res) => {
    const post = parsePost(db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id));
    if (!post) fail(404, 'Yazı bulunamadı.');
    res.json({ post });
  });
  app.post('/api/admin/posts', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail(422, 'İstek verisi geçersiz.');
    const post = { id: randomUUID(), ...validatePost(req.body) };
    if (db.prepare('SELECT 1 FROM posts WHERE slug=?').get(post.slug) || db.prepare('SELECT 1 FROM redirects WHERE old_slug=?').get(post.slug)) fail(409, 'Bu yazı adresi zaten kullanılıyor.');
    db.prepare(`INSERT INTO posts(id,title,slug,excerpt,body,cover,cover_alt,category,tags,author,created_at,updated_at,published_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(post.id, post.title, post.slug, post.excerpt, post.body, post.cover, post.cover_alt, post.category, JSON.stringify(post.tags), post.author, post.created_at, post.updated_at, post.published_at, post.status);
    res.status(201).json({ post: parsePost(db.prepare('SELECT * FROM posts WHERE id=?').get(post.id)) });
  });
  app.put('/api/admin/posts/:id', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail(422, 'İstek verisi geçersiz.');
    const old = parsePost(db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id));
    if (!old) fail(404, 'Yazı bulunamadı.');
    if (!req.body.updated_at || req.body.updated_at !== old.updated_at) fail(409, 'Bu yazı başka bir pencerede değiştirildi. Yenileyip yeniden deneyin.');
    const post = validatePost(req.body, old);
    const taken = db.prepare('SELECT id FROM posts WHERE slug=? AND id<>?').get(post.slug, old.id);
    const redirect = db.prepare('SELECT post_id FROM redirects WHERE old_slug=?').get(post.slug);
    if (taken || (redirect && redirect.post_id !== old.id)) fail(409, 'Bu yazı adresi zaten kullanılıyor.');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (old.slug !== post.slug) {
        db.prepare('DELETE FROM redirects WHERE old_slug=? AND post_id=?').run(post.slug, old.id);
        db.prepare('INSERT INTO redirects(old_slug,post_id) VALUES (?,?) ON CONFLICT(old_slug) DO UPDATE SET post_id=excluded.post_id').run(old.slug, old.id);
      }
      db.prepare(`UPDATE posts SET title=?,slug=?,excerpt=?,body=?,cover=?,cover_alt=?,category=?,tags=?,author=?,created_at=?,updated_at=?,published_at=?,status=? WHERE id=? AND updated_at=?`).run(post.title,post.slug,post.excerpt,post.body,post.cover,post.cover_alt,post.category,JSON.stringify(post.tags),post.author,post.created_at,post.updated_at,post.published_at,post.status,old.id,old.updated_at);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ post: parsePost(db.prepare('SELECT * FROM posts WHERE id=?').get(old.id)) });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, fieldSize: 4096 } });
  app.get('/api/admin/media', (_req, res) => res.json({ media: db.prepare('SELECT * FROM media ORDER BY created_at DESC').all().map(parseMedia) }));
  app.post('/api/admin/media', upload.single('file'), async (req, res) => {
    if (!req.file) fail(422, 'Yüklenecek bir görsel seçin.');
    const alt = text(req.body.alt || '', 'Alternatif metin', 500);
    const caption = text(req.body.caption || '', 'Açıklama', 1000);
    let metadata;
    try { metadata = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 }).metadata(); } catch { fail(422, 'Görsel okunamadı veya 40 megapiksel sınırını aşıyor.'); }
    const formats = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    if (!formats[metadata.format] || formats[metadata.format] !== req.file.mimetype) fail(422, 'Yalnızca gerçek JPEG, PNG, WebP veya GIF görselleri yükleyebilirsiniz.');
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) fail(422, 'Görsel boyutları geçersiz.');
    const id = randomUUID();
    const filename = `${id}.webp`;
    const originalPath = join(originals, `${id}.${metadata.format}`);
    const outputPath = join(uploads, filename);
    try {
      const output = await sharp(req.file.buffer, { limitInputPixels: 40_000_000, animated: false }).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      await writeFile(originalPath, req.file.buffer, { mode: 0o600, flag: 'wx' });
      await writeFile(outputPath, output.data, { mode: 0o600, flag: 'wx' });
      db.prepare('INSERT INTO media(id,file_name,mime,width,height,alt,caption,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, filename, 'image/webp', output.info.width, output.info.height, alt, caption, new Date().toISOString());
    } catch (error) {
      for (const file of [originalPath, outputPath]) if (existsSync(file)) unlinkSync(file);
      throw error;
    }
    res.status(201).json({ media: parseMedia(db.prepare('SELECT * FROM media WHERE id=?').get(id)) });
  });
  app.put('/api/admin/media/:id', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail(422, 'İstek verisi geçersiz.');
    if (!db.prepare('SELECT id FROM media WHERE id=?').get(req.params.id)) fail(404, 'Görsel bulunamadı.');
    db.prepare('UPDATE media SET alt=?, caption=? WHERE id=?').run(text(req.body.alt || '', 'Alternatif metin', 500), text(req.body.caption || '', 'Açıklama', 1000), req.params.id);
    res.json({ media: parseMedia(db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id)) });
  });
  app.post('/api/admin/preview', (req, res) => res.json({ html: renderMarkdown(text(req.body?.body || '', 'Yazı', 2_000_000), imageMap) }));
  app.get('/admin/preview/:id', requireAdmin, (req, res) => {
    const post = parsePost(db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id));
    if (!post) fail(404, 'Yazı bulunamadı.');
    res.type('html').send(renderPage({ pathname: `/yazi/${post.slug}`, query: { preview: '1' }, imageMap, posts: publishedPosts(), post, comments: commentsFor(post.id), siteUrl, preview: true }));
  });
  app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(join(root, 'public/admin.html')));
  app.get('/admin/admin.js', (_req, res) => res.sendFile(join(root, 'public/admin.js')));
  app.get('/admin/admin.css', (_req, res) => res.sendFile(join(root, 'public/admin.css')));
  app.use('/uploads', express.static(uploads, { dotfiles: 'deny', index: false, immutable: true, maxAge: '1y', setHeaders: res => res.set('Cache-Control', 'public, max-age=31536000, immutable') }));
  // Serve only this fixed public directory. DATA_DIR and original backups are never static roots.
  app.use(express.static(join(root, 'public'), { dotfiles: 'deny', index: false, maxAge: '1h' }));
  function publishedPosts() { return db.prepare("SELECT * FROM posts WHERE status='published' ORDER BY created_at DESC").all().map(parsePost); }
  function commentsFor(id) { return db.prepare('SELECT id,post_id,author,body,created_at,source FROM comments WHERE post_id=? ORDER BY created_at ASC').all(id); }
  app.get('/api/legacy', (_req, res) => res.json({ map: Object.fromEntries(publishedPosts().filter(p => p.legacy_id).map(p => [p.legacy_id, `/yazi/${p.slug}`])) }));
  app.get('/rss.xml', (_req, res) => {
    const posts = publishedPosts();
    const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Hindiba | Eşref Akbaş</title><link>${xml(siteUrl)}</link><description>Edebiyat, şiir ve gündelik hayattan küçük notlar.</description><language>tr</language><atom:link href="${xml(siteUrl)}/rss.xml" rel="self" type="application/rss+xml"/>${posts.map(p => `<item><title>${xml(p.title)}</title><link>${xml(siteUrl)}/yazi/${xml(p.slug)}</link><guid isPermaLink="false">hindiba:${xml(p.id)}</guid><pubDate>${xml(new Date(p.created_at).toUTCString())}</pubDate><description>${xml(p.excerpt || p.body.slice(0, 300))}</description><dc:creator>${xml(p.author)}</dc:creator></item>`).join('')}</channel></rss>`;
    res.type('application/rss+xml').send(rss);
  });
  app.get('/sitemap.xml', (_req, res) => {
    const posts = publishedPosts();
    const urls = [{ path: '/', date: '' }, { path: '/arsiv', date: '' }, { path: '/hakkinda', date: '' }, ...[...new Set(posts.map(p => p.category))].map(c => ({ path: `/kategori/${encodeURIComponent(c)}`, date: '' })), ...[...new Set(posts.flatMap(p => p.tags))].map(t => ({ path: `/etiket/${encodeURIComponent(t)}`, date: '' })), ...posts.map(p => ({ path: `/yazi/${p.slug}`, date: p.updated_at }))];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${xml(siteUrl + u.path)}</loc>${u.date ? `<lastmod>${xml(u.date)}</lastmod>` : ''}</url>`).join('')}</urlset>`);
  });
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nSitemap: ${siteUrl}/sitemap.xml\n`));
  app.get('/yazi/:slug', (req, res) => {
    const post = parsePost(db.prepare("SELECT * FROM posts WHERE slug=? AND status='published'").get(req.params.slug));
    if (!post) {
      const redirect = db.prepare("SELECT p.slug FROM redirects r JOIN posts p ON p.id=r.post_id WHERE r.old_slug=? AND p.status='published'").get(req.params.slug);
      if (redirect) return res.redirect(301, `/yazi/${redirect.slug}`);
      return res.status(404).type('html').send(renderPage({ pathname: '/404', query: {}, imageMap, posts: publishedPosts(), comments: [], siteUrl }));
    }
    res.type('html').send(renderPage({ pathname: req.path, query: req.query, imageMap, posts: publishedPosts(), post, comments: commentsFor(post.id), siteUrl }));
  });
  app.get(['/', '/kategori/:category', '/etiket/:tag', '/arsiv', '/hakkinda', '/ara'], (req, res) => res.type('html').send(renderPage({ pathname: req.path, query: req.query, imageMap, posts: publishedPosts(), comments: [], siteUrl })));
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Adres bulunamadı.' });
    res.status(404).type('html').send(renderPage({ pathname: '/404', query: {}, imageMap, posts: publishedPosts(), comments: [], siteUrl }));
  });
  app.use((error, req, res, _next) => {
    let status = error.status || 500;
    let message = error.message;
    if (error instanceof multer.MulterError) { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 422; message = error.code === 'LIMIT_FILE_SIZE' ? 'Görsel en fazla 10 MB olabilir.' : 'Yükleme geçersiz. Tek bir görsel seçin.'; }
    if (error.type === 'entity.too.large') { status = 413; message = 'İçerik boyutu sınırı aşıldı.'; }
    if (error.type === 'entity.parse.failed') { status = 400; message = 'İstek verisi okunamadı.'; }
    if (status >= 500) { message = 'İşlem tamamlanamadı. Lütfen yeniden deneyin.'; console.error('Request failed:', error.code || error.name); }
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
    res.status(status).type('text/plain').send(message);
  });
  return app;
}
