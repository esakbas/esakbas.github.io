import { readFileSync, existsSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs';
import { resolve, join, sep, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hash, cliOptions } from './import-issues.js';

export function restoreBackup({ backupDir, destination }) {
  backupDir = resolve(backupDir); destination = resolve(destination);
  if (destination === backupDir || destination.startsWith(backupDir + sep)) throw new Error('Geri yükleme hedefi yedek dizininin dışında olmalı.');
  if (existsSync(destination)) throw new Error('Geri yükleme yalnızca yeni, henüz bulunmayan bir dizine yapılır.');
  const manifest = JSON.parse(readFileSync(join(backupDir, 'backup-manifest.json'), 'utf8'));
  if (manifest.format !== 'hindiba-backup-v1' || !Array.isArray(manifest.entries)) throw new Error('Desteklenmeyen veya bozuk yedek bildirimi.');
  if (!manifest.entries.some(e => e.path === 'data/hindiba.sqlite')) throw new Error('Yedekte veritabanı yok.');
  const entries = manifest.entries.map(entry => {
    if (typeof entry.path !== 'string' || !/^(data|source)\//.test(entry.path) || entry.path.includes('\\') || entry.path.split('/').includes('..')) throw new Error('Yedek dosya yolu güvenli değil.');
    const source = resolve(backupDir, entry.path);
    if (!source.startsWith(backupDir + sep)) throw new Error('Yedek dosya yolu dışarı çıkıyor.');
    const bytes = readFileSync(source);
    if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw new Error(`Yedek doğrulaması başarısız: ${entry.path}`);
    return { ...entry, source };
  });
  // All hashes are checked before creating any output or touching an active database.
  const checkDb = new DatabaseSync(join(backupDir, 'data/hindiba.sqlite'), { readOnly: true });
  try { const result = checkDb.prepare('PRAGMA integrity_check').all(); if (result.some(r => Object.values(r)[0] !== 'ok')) throw new Error('SQLite bütünlük kontrolü başarısız.'); }
  finally { checkDb.close(); }
  mkdirSync(destination, { recursive: true, mode: 0o700 }); chmodSync(destination, 0o700);
  for (const entry of entries) {
    const rel = entry.path.startsWith('data/') ? entry.path.slice(5) : `source-backup/${entry.path.slice(7)}`;
    const target = resolve(destination, rel);
    if (!target.startsWith(destination + sep)) throw new Error('Geri yükleme yolu güvenli değil.');
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); copyFileSync(entry.source, target); chmodSync(target, 0o600);
  }
  writeFileSync(join(destination, 'restore-info.json'), JSON.stringify({ restoredAt: new Date().toISOString(), sourceManifestCreatedAt: manifest.createdAt, files: entries.length }, null, 2), { mode: 0o600 });
  // Source sessions are no longer valid after restore. Password hashes remain usable.
  const restored = new DatabaseSync(join(destination, 'hindiba.sqlite'));
  try { if (restored.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'").get()) restored.exec('DELETE FROM sessions'); }
  finally { restored.close(); }
  return { destination, files: entries.length, checksumsVerified: true, databaseIntegrity: 'ok', sessionsInvalidated: true, next: 'Uygulamayı durdurun; DATA_DIR değerini bu yeni dizine yönlendirip yeniden başlatın. Eski dizini saklayın.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const options = cliOptions(); if (!options.backup || !options.to) throw new Error('Kullanım: node scripts/restore.js --backup YEDEK_DİZİNİ --to YENİ_DATA_DİZİNİ'); console.log(JSON.stringify(restoreBackup({ backupDir: options.backup, destination: options.to }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
