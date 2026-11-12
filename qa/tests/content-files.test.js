import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import { exportContent, parseContentFile } from '../scripts/export-content.js';

const sourceDir = fileURLToPath(new URL('../content/source-backup', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function temporary(t) { const dir = mkdtempSync(join(tmpdir(), 'hindiba-files-')); t.after(() => rmSync(dir, { recursive:true, force:true })); return dir; }

// The immutable archived nine articles are the regression fixtures, not sample prose.
test('all original nine articles retain byte-exact bodies and original metadata in Markdown files', t => {
  const outputDir = join(temporary(t), 'posts');
  const issues = JSON.parse(readFileSync(join(sourceDir, 'github-issues.json'), 'utf8')).filter(issue => !issue.pull_request && issue.labels?.length);
  assert.equal(issues.length, 9);
  const result = exportContent({ sourceDir, outputDir });
  assert.equal(result.sourcePosts, 9); assert.equal(result.created, 9); assert.equal(result.skipped, 0);
  assert.equal(result.ledgerInitialized, true); assert.equal(result.ledgerEntries, 9);
  assert.ok(result.sourceFilesVerified >= 86);
  assert.equal(readdirSync(outputDir).filter(file => file.endsWith('.md')).length, 9);
  for (const issue of issues) {
    const id = `github-${issue.id}`, { metadata: meta, bodyBytes } = parseContentFile(readFileSync(join(outputDir, `${id}.md`)));
    assert.deepEqual(bodyBytes, Buffer.from(issue.body ?? '', 'utf8'), `${issue.title}: body bytes`);
    assert.equal(meta.title, issue.title); assert.equal(meta.id, id); assert.equal(meta.legacy_id, String(issue.id));
    assert.equal(meta.source_key, `github:esakbas/esakbas.github.io:${issue.id}`);
    assert.equal(meta.created_at, issue.created_at); assert.equal(meta.updated_at, issue.updated_at || issue.created_at); assert.equal(meta.published_at, issue.created_at);
    assert.equal(typeof meta.created_at, 'string'); assert.equal(meta.status, 'published');
    assert.deepEqual(meta.tags, issue.labels.map(label => label.name)); assert.equal(meta.category, issue.labels[0].name);
    assert.equal(meta.author, issue.user?.login || 'Eşref Akbaş'); assert.equal(meta.source_body_sha256, digest(bodyBytes));
    assert.equal(meta.legacy_url, `https://esakbas.github.io/#post-${issue.id}`);
    assert.equal(meta.source_file, 'content/source-backup/github-issues.json');
    assert.match(meta.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
  const byTitle = Object.fromEntries(result.posts.map(post => [parseContentFile(readFileSync(join(outputDir, post.file))).metadata.title, post.slug]));
  assert.equal(byTitle['Özlenene Mektup'], 'ozlenene-mektup'); assert.equal(byTitle['...'], 'yazi-7');
});

test('rerunning exporter neither duplicates articles nor overwrites panel edits, even when a slug changes', t => {
  const outputDir = join(temporary(t), 'posts'); exportContent({ sourceDir, outputDir });
  const file = join(outputDir, 'github-6210660748.md');
  const parsed = parseContentFile(readFileSync(file));
  parsed.metadata.title = 'Panelde düzenlediğim başlık';
  parsed.metadata.slug = 'yeni-adres';
  const edited = Buffer.concat([Buffer.from(`---\n${stringify(parsed.metadata)}---\n`), parsed.bodyBytes, Buffer.from('\n\nPanelde eklenen yeni paragraf.')]);
  writeFileSync(file, edited);
  const second = exportContent({ sourceDir, outputDir });
  assert.equal(second.created, 0); assert.equal(second.skipped, 9);
  assert.deepEqual(readFileSync(file), edited);
  assert.equal(parseContentFile(readFileSync(file)).metadata.slug, 'yeni-adres');
  assert.equal(readdirSync(outputDir).filter(file => file.endsWith('.md')).length, 9);
});

test('export never normalizes CRLF, leading whitespace, Unicode, frontmatter-like text, or final newline', t => {
  const dir = temporary(t), source = join(dir, 'source'), outputDir = join(dir, 'posts'); mkdirSync(source);
  const body = '\r\n  Sevgili Hindiba,\r\n\r\n---\nİı Şş Ğğ Öö Üü Çç 🌿\u2028\nSon satır.  ';
  const issue = { id: 42, number:42, title:'İçimdeki Şiir', body, labels:[{name:'siir'}], user:{login:'esakbas'}, created_at:'2026-09-01T19:04:57Z', updated_at:'2026-09-02T00:01:02Z' };
  writeFileSync(join(source,'github-issues.json'),JSON.stringify([issue]));
  const report = exportContent({ sourceDir:source,outputDir });
  const parsed = parseContentFile(readFileSync(join(outputDir,'github-42.md')));
  assert.equal(report.created,1); assert.equal(parsed.metadata.slug,'icimdeki-siir'); assert.deepEqual(parsed.bodyBytes,Buffer.from(body));
});

test('a damaged archived source fails integrity checks before creating any article files', t => {
  const dir=temporary(t), source=join(dir,'source'), outputDir=join(dir,'posts'); mkdirSync(source);
  const bytes=Buffer.from('[]'); writeFileSync(join(source,'github-issues.json'),bytes);
  writeFileSync(join(source,'checksums.json'),JSON.stringify([{path:'github-issues.json',bytes:bytes.length,sha256:digest(bytes)}]));
  writeFileSync(join(source,'github-issues.json'),'[{"tampered":true}]');
  assert.throws(() => exportContent({sourceDir:source,outputDir}), /sağlama toplamı/); assert.equal(existsSync(outputDir),false);
});


test('a previously imported article removed by native unpublish is never resurrected by re-export', t => {
  const outputDir = join(temporary(t), 'posts');
  const sourceChecksums = JSON.parse(readFileSync(join(sourceDir, 'checksums.json'), 'utf8'));
  const sourceBefore = sourceChecksums.map(item => digest(readFileSync(join(sourceDir, item.path))));
  exportContent({ sourceDir, outputDir });
  const id = 'github-6210660748', removedFile = join(outputDir, `${id}.md`);
  rmSync(removedFile);
  const result = exportContent({ sourceDir, outputDir });
  assert.equal(result.created, 0); assert.equal(result.skipped, 9);
  assert.deepEqual(result.notRestoredIds, [id]); assert.equal(result.ledgerEntries, 9);
  assert.equal(existsSync(removedFile), false);
  assert.equal(readdirSync(outputDir).filter(file => file.endsWith('.md')).length, 8);
  const ledger = JSON.parse(readFileSync(join(outputDir, '.migration-ledger.json'), 'utf8'));
  assert.equal(ledger.imported.length, 9); assert.ok(ledger.imported.some(entry => entry.id === id));
  const third = exportContent({ sourceDir, outputDir });
  assert.equal(third.created, 0); assert.deepEqual(third.notRestoredIds, [id]);
  assert.equal(existsSync(removedFile), false);
  assert.deepEqual(sourceChecksums.map(item => digest(readFileSync(join(sourceDir, item.path)))), sourceBefore);
});

test('existing original files are adopted into the migration ledger without changing their bytes', t => {
  const outputDir = join(temporary(t), 'posts'); exportContent({ sourceDir, outputDir });
  rmSync(join(outputDir, '.migration-ledger.json'));
  const files = readdirSync(outputDir).filter(file => file.endsWith('.md'));
  const before = files.map(file => digest(readFileSync(join(outputDir, file))));
  const result = exportContent({ sourceDir, outputDir });
  assert.equal(result.created, 0); assert.equal(result.skipped, 9); assert.equal(result.ledgerInitialized, true); assert.equal(result.ledgerAdded, 9);
  assert.deepEqual(files.map(file => digest(readFileSync(join(outputDir, file)))), before);
});

test('corrupt or inconsistent migration ledgers fail before creating or changing article files', t => {
  const root = temporary(t);
  const row = { id:'github-6210660748', source_key:'github:esakbas/esakbas.github.io:6210660748', file:'github-6210660748.md' };
  const badLedgers = ['{broken', JSON.stringify({ version:2, imported:[] }), JSON.stringify({ version:1, imported:[row,row] }), JSON.stringify({ version:1, imported:[{...row,file:'../outside.md'}] }), JSON.stringify({ version:1, imported:[{...row,source_key:'github:other/repo:6210660748'}] })];
  for (const [i, corrupt] of badLedgers.entries()) {
    const outputDir = join(root, String(i)); mkdirSync(outputDir);
    const journal = join(outputDir, '.migration-ledger.json'); writeFileSync(journal, corrupt);
    assert.throws(() => exportContent({ sourceDir, outputDir }), /Aktarım günlüğü/);
    assert.deepEqual(readdirSync(outputDir), ['.migration-ledger.json']);
    assert.equal(readFileSync(journal, 'utf8'), corrupt);
  }
});
