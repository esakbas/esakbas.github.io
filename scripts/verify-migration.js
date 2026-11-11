import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { openDatabase } from '../src/db.js';
import { readSource, sourceKey, hash, commentsFor, readJSON, cliOptions } from './import-issues.js';

export function verifyMigration({ sourceDir, dataDir }) {
  const source = readSource(sourceDir), db = openDatabase(dataDir), failures = [], matches = [];
  const mapping = readJSON(join(dataDir, 'import-images.json'), {});
  let expectedComments = 0, matchedComments = 0, expectedImages = 0, matchedImages = 0;
  try {
    for (const issue of source.posts) {
      const post = db.prepare('SELECT * FROM posts WHERE source_key=?').get(sourceKey(issue.id));
      const errors = [];
      if (!post) errors.push('yazı eksik');
      else {
        const expected = { legacy_id: String(issue.id), title: issue.title, body: issue.body || '', created_at: issue.created_at, tags: JSON.stringify(issue.labels.map(l => l.name)), category: issue.labels[0]?.name || 'gunluk', author: issue.user?.login || 'Eşref Akbaş', source_json: JSON.stringify(issue) };
        for (const [key, value] of Object.entries(expected)) if (post[key] !== value) errors.push(`${key} farklı`);
        if (post.updated_at !== (issue.updated_at || issue.created_at)) errors.push('updated_at farklı');
        if (post.published_at !== issue.created_at) errors.push('published_at farklı');
        const comments = commentsFor(source, issue); expectedComments += comments.length;
        for (const c of comments) {
          const found = db.prepare('SELECT * FROM comments WHERE id=?').get(c.id);
          if (!found || ['body','author','created_at','source_json'].some(k => found[k] !== c[k])) errors.push(`yorum eksik/farklı: ${c.id}`);
          else matchedComments++;
        }
      }
      const row = { issueId: String(issue.id), title: issue.title, sourceBodySha256: hash(issue.body || ''), importedBodySha256: post ? hash(post.body) : null, legacyUrl: `https://esakbas.github.io/#post-${issue.id}`, newPath: post ? `/yazi/${post.slug}` : null };
      if (errors.length) failures.push({ ...row, errors }); else matches.push(row);
    }
    for (const image of source.images) {
      if (image.status !== 'backed_up') continue;
      expectedImages++;
      const target = mapping[image.url];
      const file = target && /^\/uploads\/[^/]+$/.test(target) ? join(dataDir, target.slice(1)) : null;
      if (file && existsSync(file) && (!image.sha256 || hash(readFileSync(file)) === image.sha256)) matchedImages++;
      else failures.push({ image: image.url, errors: ['görsel eksik veya sağlama toplamı farklı'] });
    }
    const count = Number(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE source_key LIKE ?').get('github:esakbas/esakbas.github.io:%').n);
    if (count !== source.posts.length) failures.push({ errors: [`kaynak yazı sayısı ${source.posts.length}, aktarılan ${count}`] });
    const firestorePosts = readJSON(join(source.sourceDir, 'firestore-posts.json'), { documents: [] });
    const actualIds = new Set(source.posts.map(p => String(p.id)));
    const orphans = (firestorePosts.documents || []).map(p => p.name?.split('/').at(-1)).filter(id => id && !actualIds.has(id));
    return { verifiedAt: new Date().toISOString(), passed: failures.length === 0, sourceFilesVerified: source.sourceFilesVerified, sourcePosts: source.posts.length, importedPosts: count, exactPosts: matches.length, expectedComments, matchedComments, expectedImages, matchedImages, unreachableArticleImageUrls: source.images.filter(i => i.status !== 'backed_up').map(i => i.url), orphanFirestorePostIds: orphans, limitation: orphans.length ? 'Bu Firebase belge kimliklerinin GitHub yazı gövdeleri mevcut kaynakta bulunamadı. Ham Firebase belgeleri yedeklendi; bu yazıların taşındığı iddia edilmez.' : null, matches, failures };
  } finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = cliOptions(), report = verifyMigration({ sourceDir: options.source || 'content/source-backup', dataDir: options.data || process.env.DATA_DIR || 'data' });
    if (options.report) writeFileSync(options.report, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
