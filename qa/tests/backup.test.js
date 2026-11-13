import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createBackup } from '../scripts/backup.js';

const script = resolve(import.meta.dirname, '../scripts/backup.js');
const privateBody = 'Bu yalnız yerel yedek testindeki özel taslaktır.\r\n\r\n![Bir fotoğraf](/uploads/private-photo.png)\n';
const privatePhoto = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEaoAAAAASUVORK5CYII=', 'base64');
function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, '-c', 'commit.gpgsign=false', ...args], { stdio: 'pipe' });
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hindiba-private-backup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, 'origin.git'), author = join(root, 'author'), repo = join(root, 'single-branch-clone');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', origin], { stdio: 'pipe' });
  execFileSync('git', ['init', '--initial-branch=main', author], { stdio: 'pipe' });
  git(author, 'config', 'user.name', 'Offline backup fixture');
  git(author, 'config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(author, 'content/posts'), { recursive: true });
  writeFileSync(join(author, 'content/posts/published.md'), '---\ntitle: Yayımlanmış yazı\nstatus: published\n---\nYayımlanan metin.\n');
  git(author, 'add', '.');git(author, 'commit', '-m', 'Published fixture');
  git(author, 'remote', 'add', 'origin', origin);git(author, 'push', 'origin', 'main');
  git(author, 'checkout', '-b', 'cms/private-draft');
  mkdirSync(join(author, 'content/media'), { recursive: true });
  writeFileSync(join(author, 'content/posts/private-draft.md'), privateBody);
  writeFileSync(join(author, 'content/media/private-photo.png'), privatePhoto);
  git(author, 'add', '.');git(author, 'commit', '-m', 'Private draft fixture');git(author, 'push', 'origin', 'cms/private-draft');
  const draftSha = git(author, 'rev-parse', 'HEAD').toString().trim();
  git(author, 'checkout', 'main');
  execFileSync('git', ['clone', '--single-branch', '--branch', 'main', origin, repo], { stdio: 'pipe' });
  return { root, origin, repo, draftSha };
}

test('private bundle and documented mirror restore preserve a remote-only draft, published file and original photo bytes', t => {
  const f = fixture(t), outputDir = join(f.root, 'private-backup');
  assert.equal(spawnSync('git', ['-C', f.repo, 'rev-parse', '--verify', 'refs/remotes/origin/cms/private-draft'], { stdio: 'pipe' }).status, 128);
  const result = createBackup({ repoDir: f.repo, outputDir });
  assert.equal(result.private, true);
  const bundle = join(outputDir, result.file), bytes = readFileSync(bundle);
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.match(result.restore, /^git clone --mirror /);
  const manifest = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.restore, result.restore);
  const restored = join(f.root, 'restored.git');
  execFileSync('git', ['clone', '--mirror', bundle, restored], { stdio: 'pipe' });
  assert.equal(git(restored, 'rev-parse', 'refs/remotes/origin/cms/private-draft').toString().trim(), f.draftSha);
  assert.equal(git(restored, 'show', 'refs/remotes/origin/cms/private-draft:content/posts/private-draft.md').toString(), privateBody);
  assert.deepEqual(git(restored, 'show', 'refs/remotes/origin/cms/private-draft:content/media/private-photo.png'), privatePhoto);
  assert.deepEqual(git(restored, 'show', 'refs/heads/main:content/posts/published.md'), git(f.repo, 'show', 'HEAD:content/posts/published.md'));
  assert.equal(spawnSync('git', ['-C', restored, 'show', 'refs/heads/main:content/posts/private-draft.md'], { stdio: 'pipe' }).status, 128);
  if (process.platform !== 'win32') {
    assert.equal(statSync(outputDir).mode & 0o777, 0o700);
    assert.equal(statSync(bundle).mode & 0o777, 0o600);
    assert.equal(statSync(join(outputDir, 'manifest.json')).mode & 0o777, 0o600);
  }
});

test('backup rejects public/admin/build/git paths from nested directories and through symlink parents before writing', t => {
  const f = fixture(t);
  for (const directory of ['public', 'admin', '_site', 'docs']) mkdirSync(join(f.repo, directory));
  const nested = join(f.repo, 'docs');
  for (const directory of ['public', 'admin', '_site', '.git']) {
    const outputDir = join(f.repo, directory, 'must-not-exist');
    assert.throws(() => createBackup({ repoDir: nested, outputDir }), /public, admin, _site veya \.git/);
    assert.equal(existsSync(outputDir), false);
  }
  const alias = join(f.root, 'innocent-alias');
  symlinkSync(join(f.repo, 'public'), alias, process.platform === 'win32' ? 'junction' : 'dir');
  const throughAlias = join(alias, 'new-parent', 'must-not-exist');
  assert.throws(() => createBackup({ repoDir: nested, outputDir: throughAlias }), /public, admin, _site veya \.git/);
  assert.equal(existsSync(join(f.repo, 'public/new-parent')), false);
  const linked = join(f.root, 'linked-worktree');
  git(f.repo, 'worktree', 'add', '--detach', linked, 'main');
  const actualGitDirectory = git(linked, 'rev-parse', '--absolute-git-dir').toString().trim();
  const metadataTarget = join(actualGitDirectory, 'must-not-exist');
  assert.throws(() => createBackup({ repoDir: linked, outputDir: metadataTarget }), /public, admin, _site veya \.git/);
  assert.equal(existsSync(metadataTarget), false);
});

test('missing --out arguments fail clearly and an existing backup directory is never overwritten', t => {
  const f = fixture(t), outputDir = join(f.root, 'already-backed-up');
  mkdirSync(outputDir);writeFileSync(join(outputDir, 'sentinel'), 'Keep this existing backup.');
  assert.throws(() => createBackup({ repoDir: f.repo, outputDir }), /üzerine yazılmaz/);
  assert.deepEqual(readdirSync(outputDir), ['sentinel']);
  assert.equal(readFileSync(join(outputDir, 'sentinel'), 'utf8'), 'Keep this existing backup.');
  const before = readdirSync(f.root).sort();
  for (const args of [['--out'], ['--out', '--unknown']]) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: f.repo, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--out için bir dizin gerekli/);
    assert.deepEqual(readdirSync(f.root).sort(), before);
  }
});
