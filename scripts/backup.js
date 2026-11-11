import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readdirSync, lstatSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, cliOptions } from './import-issues.js';

export function filesUnder(root) {
  const results = [];
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Yedekte sembolik bağlantı desteklenmiyor: ${relative(root, path)}`);
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) results.push(path);
    }
  }
  visit(root); return results;
}
export function createBackup({ dataDir, destination, sourceDir }) {
  dataDir = resolve(dataDir); destination = resolve(destination);
  if (destination === dataDir || destination.startsWith(dataDir + sep)) throw new Error('Yedek hedefi DATA_DIR dışında olmalı.');
  if (existsSync(destination)) throw new Error('Yedek hedefi zaten var; üzerine yazılmaz.');
  if (!existsSync(join(dataDir, 'hindiba.sqlite'))) throw new Error('Yedeklenecek hindiba.sqlite bulunamadı.');
  const files = filesUnder(dataDir).filter(file => !/^hindiba\.sqlite(?:-wal|-shm)?$/.test(relative(dataDir, file)));
  mkdirSync(join(destination, 'data'), { recursive: true, mode: 0o700 });
  chmodSync(destination, 0o700);
  const db = new DatabaseSync(join(dataDir, 'hindiba.sqlite'));
  try { db.prepare('VACUUM INTO ?').run(join(destination, 'data', 'hindiba.sqlite')); }
  finally { db.close(); }
  for (const file of files) {
    const target = join(destination, 'data', relative(dataDir, file));
    mkdirSync(resolve(target, '..'), { recursive: true, mode: 0o700 });
    copyFileSync(file, target); chmodSync(target, 0o600);
  }
  if (sourceDir && existsSync(sourceDir)) for (const file of filesUnder(resolve(sourceDir))) {
    const target = join(destination, 'source', relative(resolve(sourceDir), file));
    mkdirSync(resolve(target, '..'), { recursive: true, mode: 0o700 });
    copyFileSync(file, target); chmodSync(target, 0o600);
  }
  chmodSync(join(destination, 'data', 'hindiba.sqlite'), 0o600);
  const entries = filesUnder(destination).map(file => { const bytes = readFileSync(file); return { path: relative(destination, file).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) }; });
  const manifest = { format: 'hindiba-backup-v1', createdAt: new Date().toISOString(), database: 'data/hindiba.sqlite', privacy: 'Özel yedek: yönetici parola hashleri, oturum kayıtları ve yüklemelerin asıllarını içerir. Herkese açık depoya koymayın.', consistency: 'SQLite VACUUM INTO ile tutarlı anlık görüntü. Medya dosyaları değişmez/adları benzersizdir; yedek sırasında yüklemeleri duraklatmak önerilir.', entries };
  writeFileSync(join(destination, 'backup-manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { destination, files: entries.length, bytes: entries.reduce((n, e) => n + e.bytes, 0), includesSourceBackup: entries.some(e => e.path.startsWith('source/')), private: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = cliOptions(), name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    console.log(JSON.stringify(createBackup({ dataDir: options.data || process.env.DATA_DIR || 'data', destination: options.out || join('work', name), sourceDir: options.source || 'content/source-backup' }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
