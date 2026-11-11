import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { openDatabase } from '../src/db.js';

export const sourceKey = id => `github:esakbas/esakbas.github.io:${id}`;
export const hash = value => createHash('sha256').update(value).digest('hex');
export function readJSON(path, fallback) { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; }
export function readSource(sourceDir) {
  sourceDir = resolve(sourceDir);
  const checksums = readJSON(join(sourceDir, 'checksums.json'), []);
  if (!Array.isArray(checksums)) throw new Error('Kaynak sağlama toplamı bildirimi geçersiz.');
  for (const entry of checksums) {
    const file = safeSourcePath(sourceDir, entry.path);
    if (!existsSync(file)) throw new Error(`Kaynak yedek dosyası eksik: ${entry.path}`);
    const bytes = readFileSync(file);
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw new Error(`Kaynak yedek sağlama toplamı uyuşmuyor: ${entry.path}`);
  }
  const all = readJSON(join(sourceDir, 'github-issues.json'), null);
  if (!Array.isArray(all)) throw new Error('github-issues.json bulunamadı veya geçerli bir dizi değil.');
  return { sourceDir, sourceFilesVerified: checksums.length, all, posts: all.filter(p => !p.pull_request && Array.isArray(p.labels) && p.labels.length), githubComments: readJSON(join(sourceDir, 'github-comments.json'), {}), firestoreComments: readJSON(join(sourceDir, 'firestore-comments.json'), {}), images: readJSON(join(sourceDir, 'images.json'), []), manifest: readJSON(join(sourceDir, 'migration-manifest.json'), null) };
}
export function decodeFirestore(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestore);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decodeFirestore(x)]));
  return v;
}
export function commentsFor(source, post) {
  const gh = (source.githubComments[String(post.id)] || []).map(c => ({ id: `github-comment-${c.id}`, post_id: `github-${post.id}`, author: c.user?.login || 'Anonim', body: c.body || '', created_at: c.created_at || post.created_at, source: 'github', source_json: JSON.stringify(c) }));
  const firebase = (source.firestoreComments[String(post.id)] || []).map(c => {
    const fields = Object.fromEntries(Object.entries(c.fields || {}).map(([k, v]) => [k, decodeFirestore(v)]));
    return { id: `firebase-${post.id}-${c.name?.split('/').at(-1) || hash(JSON.stringify(c))}`, post_id: `github-${post.id}`, author: String(fields.userName || fields.author || 'Anonim'), body: String(fields.text || fields.body || ''), created_at: fields.createdAt || c.createTime || post.created_at, source: 'firebase', source_json: JSON.stringify(c) };
  });
  return [...gh, ...firebase];
}
export function slugify(text) {
  return text.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, x => ({ ç:'c', ğ:'g', ı:'i', ö:'o', ş:'s', ü:'u' }[x])).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}
function safeSourcePath(sourceDir, path) {
  const target = resolve(sourceDir, path);
  if (!target.startsWith(resolve(sourceDir) + sep)) throw new Error('Yedek içindeki görsel yolu güvenli değil.');
  return target;
}
export function importIssues({ sourceDir, dataDir }) {
  const source = readSource(sourceDir);
  dataDir = resolve(dataDir);
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  const db = openDatabase(dataDir);
  const summary = { sourceFilesVerified: source.sourceFilesVerified, sourcePosts: source.posts.length, inserted: 0, skipped: 0, commentsInserted: 0, imagesCopied: 0, missingImages: [], orphanCommentPostIds: [], notes: [] };
  const mapping = readJSON(join(dataDir, 'import-images.json'), {});
  // Copy the archived bytes first; never fetch or rewrite source article text.
  for (const image of source.images) {
    if (image.status !== 'backed_up' || !image.path) { summary.missingImages.push(image.url); continue; }
    const from = safeSourcePath(source.sourceDir, image.path);
    if (!existsSync(from)) { summary.missingImages.push(image.url); continue; }
    const bytes = readFileSync(from), sha = hash(bytes);
    if (image.sha256 && sha !== image.sha256) throw new Error(`Görsel sağlama toplamı uyuşmuyor: ${image.url}`);
    const suffix = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[image.mime] || extname(image.path).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(suffix)) { summary.missingImages.push(image.url); continue; }
    const name = `import-${sha}${suffix}`;
    copyFileSync(from, join(dataDir, 'uploads', name));
    mapping[image.url] = `/uploads/${name}`;
    summary.imagesCopied++;
  }
  writeFileSync(join(dataDir, 'import-images.json'), JSON.stringify(mapping, null, 2));
  try {
    db.exec('BEGIN IMMEDIATE');
    const insert = db.prepare(`INSERT INTO posts (id,legacy_id,source_key,title,slug,excerpt,body,cover,cover_alt,category,tags,author,created_at,updated_at,published_at,status,source_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insertComment = db.prepare('INSERT OR IGNORE INTO comments (id,post_id,author,body,created_at,source,source_json) VALUES (?,?,?,?,?,?,?)');
    for (const issue of source.posts) {
      const key = sourceKey(issue.id);
      let post = db.prepare('SELECT * FROM posts WHERE source_key = ?').get(key);
      if (!post) {
        const tags = issue.labels.map(l => l.name), body = issue.body || '';
        const baseSlug = slugify(issue.title) || `yazi-${issue.number}`;
        let slug = baseSlug;
        if (db.prepare('SELECT 1 FROM posts WHERE slug=?').get(slug)) slug = `${baseSlug}-${issue.id}`;
        const imageURL = body.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/)?.[1] || '';
        insert.run(`github-${issue.id}`, String(issue.id), key, issue.title, slug, body.replace(/[#*_>`\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180), body, mapping[imageURL] || imageURL, '', tags[0] || 'gunluk', JSON.stringify(tags), issue.user?.login || 'Eşref Akbaş', issue.created_at, issue.updated_at || issue.created_at, issue.created_at, 'published', JSON.stringify(issue));
        summary.inserted++;
        post = { id: `github-${issue.id}` };
      } else summary.skipped++;
      for (const comment of commentsFor(source, issue)) summary.commentsInserted += Number(insertComment.run(comment.id, post.id, comment.author, comment.body, comment.created_at, comment.source, comment.source_json).changes);
    }
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  finally { db.close(); }
  const postIds = new Set(source.posts.map(p => String(p.id)));
  summary.orphanCommentPostIds = Object.entries(source.firestoreComments).filter(([id, comments]) => !postIds.has(id) && comments.length).map(([id]) => id);
  if (summary.orphanCommentPostIds.length) summary.notes.push('Kaynak yazısı bulunmayan yorumlar ham yedekte korunur; boş yazı oluşturulmaz.');
  writeFileSync(join(dataDir, 'migration-import-report.json'), JSON.stringify(summary, null, 2));
  return summary;
}
export function cliOptions(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || args[i + 1] === undefined) throw new Error('Seçenekleri --source DİZİN --data DİZİN biçiminde kullanın.');
    options[args[i].slice(2)] = args[i + 1];
  }
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const options = cliOptions(); console.log(JSON.stringify(importIssues({ sourceDir: options.source || 'content/source-backup', dataDir: options.data || process.env.DATA_DIR || 'data' }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
