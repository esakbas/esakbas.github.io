// Only GitHub Actions starts this fixture. It exports the original public nine
// articles into a disposable directory, never the editor's current private posts.
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { exportContent } from './export-content.js';
import { buildSite } from './build.js';
import { serveStatic } from '../src/serve.js';

const projectRoot = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'hindiba-cms-browser-'));
const posts = join(temporary, 'content/posts');
const media = join(temporary, 'content/media');
const output = join(temporary, 'site');
const marker = 'HINDIBA_CI_ONLY_PRIVATE_DRAFT_40d9857d';
let server, cleaning = false;
async function cleanup(code = 0) {
  if (cleaning) return;
  cleaning = true;
  if (server) await new Promise(done => { server.close(done);server.closeAllConnections(); });
  await rm(temporary, { recursive: true, force: true });
  process.exitCode = code;
}
try {
  await mkdir(media, { recursive: true });
  process.env.XDG_CACHE_HOME = join(temporary, 'cache');
  const exported = exportContent({ sourceDir: join(projectRoot, 'content/source-backup'), outputDir: posts });
  if (exported.sourcePosts !== 9 || exported.created !== 9) throw new Error('Browser fixtures require the nine original public articles.');
  const repoTree = { content: { posts: {}, media: {} } };
  for (const file of await readdir(posts)) {
    if (!file.endsWith('.md')) continue;
    repoTree.content.posts[file] = { path: `content/posts/${file}`, content: await readFile(join(posts, file), 'utf8') };
  }
  const draft = { id: 'browser-private-fixture', title: 'Özel tarayıcı taslağı', slug: 'ozel-tarayici-taslagi', status: 'draft', created_at: '2026-11-11T00:00:00Z', updated_at: '2026-11-11T00:00:00Z', category: 'gunluk', tags: [], author: 'CI fixture' };
  await writeFile(join(posts, 'private-browser-fixture.md'), `---\n${stringify(draft)}---\n${marker}\n`);
  const built = await buildSite({ contentDir: posts, mediaDir: media, outputDir: output, branch: 'main', siteUrl: 'http://127.0.0.1:4173' });
  if (built.publishedPosts !== 9 || built.sourcePosts !== 10 || built.guardedBranch) throw new Error('Browser fixture failed published/private content isolation.');
  // This test-only URL contains public source records only, never the fake draft.
  await mkdir(join(output, '__fixtures'), { recursive: true });
  await writeFile(join(output, '__fixtures/repo.json'), JSON.stringify(repoTree));
  server = serveStatic({ rootDir: output, port: 4173, host: '127.0.0.1' });
  server.on('error', error => { console.error(error.message);void cleanup(1); });
  server.on('listening', () => console.log('Isolated public-nine CMS browser fixture ready at http://127.0.0.1:4173'));
  process.on('SIGINT', () => { void cleanup(); });
  process.on('SIGTERM', () => { void cleanup(); });
} catch (error) {
  console.error(error.message);
  await cleanup(1);
}
