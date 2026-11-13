import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { stringify, parse } from 'yaml';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function slugify(text) {
  return text.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, char => ({ ç:'c', ğ:'g', ı:'i', ö:'o', ş:'s', ü:'u' }[char])).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
}

/** The returned bodyBytes is a slice of the original bytes; it is never trimmed. */
export function parseContentFile(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  const start = bytes.subarray(0, 5).equals(Buffer.from('---\r\n')) ? 5 : bytes.subarray(0, 4).equals(Buffer.from('---\n')) ? 4 : 0;
  if (!start) throw new Error('Markdown dosyası YAML önbilgisiyle başlamalı.');
  const boundaries = ['\n---\n', '\n---\r\n'].map(value => ({ delimiter: Buffer.from(value), end: bytes.indexOf(Buffer.from(value), start) })).filter(value => value.end >= 0).sort((a, b) => a.end - b.end);
  const { end = -1, delimiter } = boundaries[0] || {};
  if (end < 0) throw new Error('Markdown önbilgi kapanışı bulunamadı.');
  const metadataEnd = bytes[end - 1] === 13 ? end - 1 : end;
  const metadata = parse(bytes.subarray(start, metadataEnd).toString('utf8'));
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Markdown önbilgisi geçerli bir nesne olmalı.');
  const bodyBytes = bytes.subarray(end + delimiter.length);
  return { metadata, bodyBytes, body: bodyBytes.toString('utf8') };
}

function readSource(sourceDir) {
  sourceDir = resolve(sourceDir);
  const checksumsFile = join(sourceDir, 'checksums.json');
  const checksums = existsSync(checksumsFile) ? JSON.parse(readFileSync(checksumsFile, 'utf8')) : [];
  if (!Array.isArray(checksums)) throw new Error('Kaynak sağlama toplamı listesi geçersiz.');
  for (const item of checksums) {
    if (!item || typeof item.path !== 'string') throw new Error('Kaynak dosya yolu geçersiz.');
    const file = resolve(sourceDir, item.path);
    if (!file.startsWith(sourceDir + sep)) throw new Error('Kaynak dosya yolu yedek dizininin dışına çıkıyor.');
    const bytes = readFileSync(file);
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw new Error(`Kaynak yedek sağlama toplamı uyuşmuyor: ${item.path}`);
  }
  const issues = JSON.parse(readFileSync(join(sourceDir, 'github-issues.json'), 'utf8'));
  if (!Array.isArray(issues)) throw new Error('github-issues.json geçerli bir dizi değil.');
  return { checksums, issues: issues.filter(issue => !issue.pull_request && Array.isArray(issue.labels) && issue.labels.length) };
}

const ledgerName = '.migration-ledger.json';
function readLedger(path) {
  if (!existsSync(path)) return { version: 1, imported: [] };
  let ledger;
  try { ledger = JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw new Error('Aktarım günlüğü bozuk; hiçbir yazı değiştirilmedi.'); }
  if (!ledger || ledger.version !== 1 || !Array.isArray(ledger.imported)) throw new Error('Aktarım günlüğü biçimi geçersiz; hiçbir yazı değiştirilmedi.');
  const ids = new Set();
  for (const entry of ledger.imported) {
    if (!entry || typeof entry.id !== 'string' || !/^github-[1-9][0-9]*$/.test(entry.id)) throw new Error('Aktarım günlüğünde geçersiz kaynak kimliği; hiçbir yazı değiştirilmedi.');
    const sourceId = entry.id.slice(7);
    if (!Number.isSafeInteger(Number(sourceId)) || entry.source_key !== `github:esakbas/esakbas.github.io:${sourceId}` || entry.file !== `${entry.id}.md` || ids.has(entry.id)) throw new Error('Aktarım günlüğünde uyumsuz veya yinelenen kayıt; hiçbir yazı değiştirilmedi.');
    ids.add(entry.id);
  }
  return ledger;
}
function saveLedger(path, ledger) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(ledger, null, 2) + '\n', { flag: 'wx' });
  renameSync(temporary, path);
}

/** Existing files and previously imported IDs belong to the editor, even after unpublishing. */
export function exportContent({ sourceDir, outputDir }) {
  if (!sourceDir || !outputDir) throw new Error('sourceDir ve outputDir gerekli.');
  const { checksums, issues } = readSource(sourceDir);
  outputDir = resolve(outputDir);
  const ledgerPath = join(outputDir, ledgerName);
  const ledgerExisted = existsSync(ledgerPath);
  // Validate the complete journal before creating directories or article files.
  const ledger = readLedger(ledgerPath);
  const imported = new Set(ledger.imported.map(entry => entry.id));
  const slugs = new Set();
  for (const file of (existsSync(outputDir) ? readdirSync(outputDir) : []).filter(file => file.endsWith('.md'))) {
    const { metadata } = parseContentFile(readFileSync(join(outputDir, file)));
    if (typeof metadata.slug === 'string') slugs.add(metadata.slug);
  }
  mkdirSync(outputDir, { recursive: true });
  const report = { sourcePosts: issues.length, sourceFilesVerified: checksums.length, created: 0, skipped: 0, notRestoredIds: [], ledgerInitialized: !ledgerExisted, ledgerAdded: 0, ledgerEntries: ledger.imported.length, posts: [] };
  function recordImported(id) {
    if (imported.has(id)) return;
    ledger.imported.push({ id, source_key: `github:esakbas/esakbas.github.io:${id.slice(7)}`, file: `${id}.md` });
    imported.add(id);
    report.ledgerAdded++;
    report.ledgerEntries = ledger.imported.length;
    // Save after each successful import/adoption; atomic rename protects the journal.
    saveLedger(ledgerPath, ledger);
  }
  for (const issue of issues) {
    if (!Number.isSafeInteger(issue.id) || issue.id <= 0 || typeof issue.title !== 'string' || (issue.body != null && typeof issue.body !== 'string')) throw new Error('Kaynak yazı kimliği, başlığı veya metni geçersiz.');
    const id = `github-${issue.id}`, file = join(outputDir, `${id}.md`);
    if (existsSync(file)) {
      report.skipped++;
      const saved = parseContentFile(readFileSync(file));
      recordImported(id);
      report.posts.push({ id, file: relative(outputDir, file), slug: saved.metadata.slug, skipped: true });
      continue;
    }
    if (imported.has(id)) {
      report.skipped++;
      report.notRestoredIds.push(id);
      report.posts.push({ id, file: relative(outputDir, file), slug: null, skipped: true, notRestored: true, reason: 'previously_imported_missing_file' });
      continue;
    }
    const body = issue.body ?? '', tags = issue.labels.map(label => label.name);
    const baseSlug = slugify(issue.title) || `yazi-${issue.number}`;
    let slug = baseSlug;
    if (slugs.has(slug)) slug = `${baseSlug}-${issue.id}`;
    if (slugs.has(slug)) throw new Error(`Yazı adresi çakışıyor: ${slug}`);
    slugs.add(slug);
    const excerpt = body.replace(/[#*_>`\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
    const cover = body.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/)?.[1] || '';
    const metadata = {
      id, legacy_id: String(issue.id), source_key: `github:esakbas/esakbas.github.io:${issue.id}`,
      title: issue.title, slug, description: excerpt, excerpt, cover, cover_alt: '',
      category: tags[0] || 'gunluk', tags, author: issue.user?.login || 'Eşref Akbaş',
      created_at: issue.created_at, updated_at: issue.updated_at || issue.created_at,
      published_at: issue.created_at, status: 'published',
      source_file: 'content/source-backup/github-issues.json', source_issue_number: issue.number,
      source_url: issue.html_url || `https://github.com/esakbas/esakbas.github.io/issues/${issue.number}`,
      legacy_url: `https://esakbas.github.io/#post-${issue.id}`,
      source_body_sha256: digest(Buffer.from(body, 'utf8')),
    };
    for (const date of ['created_at', 'updated_at', 'published_at']) if (typeof metadata[date] !== 'string' || Number.isNaN(Date.parse(metadata[date]))) throw new Error(`Kaynak yazı tarihi geçersiz: ${id}/${date}`);
    const frontmatter = `---\n${stringify(metadata, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE' })}---\n`;
    writeFileSync(file, Buffer.concat([Buffer.from(frontmatter, 'utf8'), Buffer.from(body, 'utf8')]), { flag: 'wx' });
    recordImported(id);
    report.created++;
    report.posts.push({ id, file: relative(outputDir, file), slug, bodySha256: metadata.source_body_sha256, skipped: false });
  }
  if (!ledgerExisted && !existsSync(ledgerPath)) saveLedger(ledgerPath, ledger);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i], value = process.argv[i + 1];
      if (!['--source', '--out'].includes(key) || !value) throw new Error('Kullanım: node scripts/export-content.js --source content/source-backup --out content/posts');
      options[key.slice(2)] = value;
    }
    console.log(JSON.stringify(exportContent({ sourceDir: options.source || 'content/source-backup', outputDir: options.out || 'content/posts' }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
