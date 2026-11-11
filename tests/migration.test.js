import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';
import { importIssues, hash } from '../scripts/import-issues.js';
import { verifyMigration } from '../scripts/verify-migration.js';
import { createBackup } from '../scripts/backup.js';
import { restoreBackup } from '../scripts/restore.js';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hindiba-migration-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sourceDir = join(dir, 'source'), dataDir = join(dir, 'data');
  mkdirSync(join(sourceDir, 'images'), { recursive: true });
  const image = Buffer.from('preserve bytes of archived fixture');
  writeFileSync(join(sourceDir, 'images', 'a.png'), image);
  const issue = { id: 6210660748, number: 18, title: 'Özlenene Şiir', body: 'Sevgili Hindiba,\r\n\r\n  **Hiç eksilmeden.**\n![Açıklama](https://example.test/a.png)\n', labels: [{ name:'edebiyat', color:'005500' },{ name:'gunluk', color:'220000' }], user: { login:'esakbas', id:291925961 }, created_at:'2026-09-01T19:04:57Z', updated_at:'2026-09-02T11:00:00Z' };
  const writeJSON = (name, data) => writeFileSync(join(sourceDir, name), JSON.stringify(data));
  writeJSON('github-issues.json', [issue, { ...issue, id:2, labels:[], title:'Etiketsiz' }, { ...issue, id:3, pull_request:{ url:'x' } }]);
  writeJSON('github-comments.json', { [issue.id]:[{ id:11, body:'**Yorum**\nTam metin', user:{ login:'reader' }, created_at:'2026-09-03T11:00:00Z' }] });
  writeJSON('firestore-comments.json', { [issue.id]:[{ name:`projects/test/databases/(default)/documents/posts/${issue.id}/comments/firebase-1`, fields:{ userName:{ stringValue:'Okuyucu' }, text:{ stringValue:'İkinci yorum' }, createdAt:{ timestampValue:'2026-09-04T11:00:00Z' }, likes:{ integerValue:'4' } } }] });
  writeJSON('firestore-posts.json', { documents:[{ name:`projects/t/databases/(default)/documents/posts/${issue.id}`, fields:{} },{ name:'projects/t/databases/(default)/documents/posts/999', fields:{ views:{ integerValue:'12' } } }] });
  writeJSON('images.json', [{ url:'https://example.test/a.png', path:'images/a.png', mime:'image/png', sha256:hash(image), status:'backed_up' }]);
  return { dir, sourceDir, dataDir, issue };
}

test('import preserves full text, metadata and comments; rerun never duplicates or overwrites edits', t => {
  const f = fixture(t), first = importIssues(f);
  assert.equal(first.sourcePosts, 1); assert.equal(first.inserted, 1); assert.equal(first.commentsInserted, 2);
  const report = verifyMigration(f);
  assert.equal(report.passed, true); assert.equal(report.exactPosts, 1); assert.equal(report.matchedComments, 2); assert.equal(report.matchedImages, 1); assert.deepEqual(report.orphanFirestorePostIds, ['999']);
  const db = openDatabase(f.dataDir), row = db.prepare('SELECT * FROM posts').get();
  assert.equal(row.body, f.issue.body); assert.equal(row.slug, 'ozlenene-siir'); assert.equal(row.legacy_id, String(f.issue.id)); assert.equal(row.author, 'esakbas'); assert.equal(row.published_at, f.issue.created_at);
  assert.equal(JSON.parse(row.source_json).labels[1].color, '220000');
  const second = importIssues(f); assert.equal(second.inserted, 0); assert.equal(second.skipped, 1); assert.equal(second.commentsInserted, 0);
  db.prepare('UPDATE posts SET title=?,body=? WHERE id=?').run('Düzenlenmiş başlık', 'Panelde yapılan değişiklik', row.id);
  importIssues(f);
  assert.equal(db.prepare('SELECT body FROM posts WHERE id=?').get(row.id).body, 'Panelde yapılan değişiklik');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 1); db.close();
  assert.equal(verifyMigration(f).passed, false, 'strict comparison should expose deliberate source changes');
});

test('backup makes consistent SQLite snapshot, restores bytes, expires sessions and refuses overwrite', t => {
  const f = fixture(t); importIssues(f);
  mkdirSync(join(f.dataDir, 'originals')); writeFileSync(join(f.dataDir, 'originals', 'private.jpg'), 'original pixels');
  const db = openDatabase(f.dataDir);
  db.prepare('INSERT INTO admins VALUES (?,?,?,?)').run('admin1','editor','scrypt-placeholder',new Date().toISOString());
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('hash','admin1','csrf',Date.now()+10000);
  const destination = join(f.dir, 'backup'), result = createBackup({ ...f, destination });
  assert.equal(result.includesSourceBackup, true); assert.equal(result.private, true);
  assert.throws(() => createBackup({ ...f, destination }), /zaten var/);
  assert.throws(() => createBackup({ ...f, destination:join(f.dataDir, 'nested') }), /dışında/);
  db.prepare('UPDATE posts SET body=?').run('after snapshot'); db.close();
  const restoredDir = join(f.dir, 'restored');
  const restored = restoreBackup({ backupDir:destination, destination:restoredDir });
  assert.equal(restored.checksumsVerified,true); assert.equal(restored.databaseIntegrity,'ok');
  const newDb = openDatabase(restoredDir);
  assert.equal(newDb.prepare('SELECT body FROM posts').get().body, f.issue.body);
  assert.equal(newDb.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(newDb.prepare('SELECT COUNT(*) AS n FROM admins').get().n, 1); newDb.close();
  assert.equal(readFileSync(join(restoredDir,'originals','private.jpg'),'utf8'),'original pixels');
  assert.ok(existsSync(join(restoredDir,'source-backup','github-issues.json')));
  assert.throws(() => restoreBackup({ backupDir:destination, destination:restoredDir }), /yeni/);
});

test('tampered backup fails before creating restore destination', t => {
  const f=fixture(t); importIssues(f); const backupDir=join(f.dir,'backup'); createBackup({ ...f,destination:backupDir });
  writeFileSync(join(backupDir,'data','import-images.json'),'tampered');
  const destination=join(f.dir,'must-not-exist');
  assert.throws(() => restoreBackup({backupDir,destination}), /doğrulaması başarısız/); assert.equal(existsSync(destination),false);
});
