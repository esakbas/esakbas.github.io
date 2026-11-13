import { execFileSync } from 'node:child_process';
import { mkdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join, dirname, basename, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

function pathExists(path) {
  try { lstatSync(path);return true; }
  catch (error) { if (error.code === 'ENOENT') return false;throw error; }
}
// Resolve existing parents too: an innocent-looking alias can point into public/.
function canonicalPath(path) {
  let parent = resolve(path);
  const missing = [];
  while (!pathExists(parent)) {
    const next = dirname(parent);
    if (next === parent) throw new Error('Yedek dizininin üst yolu çözülemedi.');
    missing.unshift(basename(parent));parent = next;
  }
  try { return resolve(realpathSync(parent), ...missing); }
  catch { throw new Error('Yedek dizinindeki sembolik bağlantı veya üst yol çözülemedi.'); }
}
function within(path, directory) {
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  path = normalize(path);directory = normalize(directory);
  return path === directory || path.startsWith(directory + sep);
}
function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
}
export function parseBackupArgs(args = process.argv.slice(2)) {
  if (!args.length) return {};
  if (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Kullanım: npm run backup -- --out ÖZEL_YEDEK_DİZİNİ; --out için bir dizin gerekli.');
  }
  return { outputDir: args[1] };
}

export function createBackup({ repoDir = process.cwd(), outputDir } = {}) {
  const workingDirectory = resolve(repoDir);
  let repo, gitDirectory, commonDirectory;
  try {
    repo = realpathSync(git(workingDirectory, ['rev-parse', '--show-toplevel']));
    gitDirectory = canonicalPath(git(repo, ['rev-parse', '--absolute-git-dir']));
    commonDirectory = canonicalPath(resolve(repo, git(repo, ['rev-parse', '--git-common-dir'])));
  } catch { throw new Error('Önce özel GitHub deponuzu klonlayıp yedek komutunu o klasörde çalıştırın.'); }
  if (outputDir !== undefined && (typeof outputDir !== 'string' || !outputDir.trim())) throw new Error('Yedek dizini boş olamaz.');
  const target = outputDir === undefined
    ? join(repo, 'work', `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    : resolve(workingDirectory, outputDir);
  const canonicalTarget = canonicalPath(target);
  const forbidden = ['public', 'admin', '_site', '.git'].flatMap(name => {
    const directory = join(repo, name);
    return [directory, canonicalPath(directory)];
  }).concat(gitDirectory, commonDirectory);
  if (forbidden.some(directory => within(target, directory) || within(canonicalTarget, directory))) {
    throw new Error('Özel yedek public, admin, _site veya .git altında saklanamaz; yayımlanmayan ayrı bir dizin seçin.');
  }
  if (pathExists(target)) throw new Error('Yeni bir yedek dizini seçin; önceki yedeğin üzerine yazılmaz.');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  // Fetch every private draft branch, including branches omitted by a single-branch clone.
  git(repo, ['fetch', 'origin', '+refs/heads/*:refs/remotes/origin/*']);
  const file = join(target, 'hindiba-private.bundle');
  git(repo, ['bundle', 'create', file, '--all']);
  chmodSync(file, 0o600);
  git(repo, ['bundle', 'verify', file]);
  const bytes = readFileSync(file);
  const manifest = {
    createdAt: new Date().toISOString(), private: true, file: 'hindiba-private.bundle',
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    restore: 'git clone --mirror hindiba-private.bundle hindiba-restored.git',
    inspectRefs: 'git --git-dir=hindiba-restored.git for-each-ref refs/heads refs/remotes',
    restoreNote: '--mirror, özel taslaklar dahil refs/remotes/origin/cms/* ve diğer kayıtlı ref adlarını korur. Normal git clone yalnız yerel dal reflerini geri getirir ve uzak taslak reflerini atlayabilir.',
    limitation: 'Kaydedilmemiş yerel değişiklikler ve Cloudflare secrets Git bundle içinde değildir.'
  };
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { ...manifest, outputDir: target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = createBackup(parseBackupArgs());
    console.log('Özel yedek hazır: ' + result.outputDir + '. Herkese açık depoya yüklemeyin.');
  } catch (error) {
    console.error(error.message);process.exitCode = 1;
  }
}
