import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { loadPosts } from '../src/content.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = resolve('content/source-backup');
const checksums = JSON.parse(readFileSync(join(source, 'checksums.json'), 'utf8'));
for (const item of checksums) {
  const bytes = readFileSync(join(source, item.path));
  if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) throw new Error('Kaynak yedeğinin bütünlüğü bozulmuş: ' + item.path);
}
const originals = JSON.parse(readFileSync(join(source, 'github-issues.json'), 'utf8')).filter(p => !p.pull_request && p.labels?.length);
const posts = loadPosts('content/posts');
const comparisons = originals.map(issue => {
  const post = posts.find(p => p.legacy_id === String(issue.id));
  return { id:String(issue.id), currentFile: Boolean(post), exactBody: post ? hash(post.body) === hash(issue.body || '') : false, exactTitle: post?.title === issue.title, exactDate:post?.created_at === issue.created_at };
});
const strict = process.argv.includes('--migration');
const passed = !strict || comparisons.every(p => p.currentFile && p.exactBody && p.exactTitle && p.exactDate);
console.log(JSON.stringify({ passed, sourceFilesVerified:checksums.length, sourcePosts:originals.length, currentPosts:posts.length, publishedPosts:posts.filter(p => p.status === 'published').length, exactSourceBodies:comparisons.filter(p => p.exactBody).length, comparisons, note:'Panelde düzenlenmiş veya yayından kaldırılmış içerik kaynak yedeğinden farklı olabilir; ham kaynaklar korunur.' }, null, 2));
if (!passed) process.exitCode = 1;
