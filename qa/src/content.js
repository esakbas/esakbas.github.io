import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { parseContentFile } from '../scripts/export-content.js';

const value = (v, fallback = '') => v === undefined || v === null ? fallback : String(v);
const categories = new Set(['edebiyat', 'siir', 'gunluk', 'bir-cumle']);
const taxonomy = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function loadPosts(contentDir = 'content/posts') {
  const root = resolve(contentDir), files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('İçerik dizininde sembolik bağlantı kullanılamaz.');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(file);
    }
  }
  visit(root);
  const posts = files.sort().map(file => {
    if (lstatSync(file).size > 2 * 1024 * 1024) throw new Error('Bir yazı 2 MB sınırını aşıyor.');
    const { metadata: m, body } = parseContentFile(readFileSync(file));
    const title = value(m.title).trim(), slug = value(m.slug || basename(file, '.md'));
    if (!title || title.length > 300) throw new Error('Yazının başlığı eksik veya çok uzun.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 160) throw new Error('Yazı adresinde küçük harf, rakam ve tire kullanın.');
    const tags = m.tags || [];
    if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string' || !taxonomy.test(t) || t.length > 80)) throw new Error('Yazı etiketleri küçük Latin harfleri, rakam ve tire içeren güvenli bir liste olmalı.');
    const aliases = m.aliases || [];
    if (!Array.isArray(aliases) || aliases.some(alias => typeof alias !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias) || alias.length > 160)) throw new Error('Eski yazı adresleri geçersiz.');
    const status = value(m.status, 'draft');
    if (!['published', 'draft'].includes(status)) throw new Error('Yazı durumu geçersiz.');
    const category = value(m.category, 'gunluk');
    if (!categories.has(category)) throw new Error('Yazı kategorisi geçersiz.');
    const created = value(m.created_at), updated = value(m.updated_at, created), published = value(m.published_at, created);
    if (![created, updated, published].every(date => Number.isFinite(Date.parse(date)))) throw new Error('Yazı tarihi geçersiz.');
    return {
      id: value(m.id || basename(file, '.md')), legacy_id: m.legacy_id ? value(m.legacy_id) : null,
      source_key: value(m.source_key), title, slug, body,
      excerpt: value(Object.hasOwn(m, 'description') ? m.description : m.excerpt), cover: value(m.cover), cover_alt: value(m.cover_alt),
      category, tags, aliases, author: value(m.author, 'Eşref Akbaş'),
      created_at: created, updated_at: updated, published_at: published, status,
      source_file: file
    };
  });
  const ids = new Set(), slugs = new Set();
  for (const post of posts) {
    if (ids.has(post.id)) throw new Error('Aynı kimliğe sahip birden fazla yazı var.');
    ids.add(post.id);
    if (post.status === 'published') {
      if (slugs.has(post.slug)) throw new Error('Aynı adrese sahip birden fazla yayımlanmış yazı var.');
      slugs.add(post.slug);
    }
  }
  return posts;
}
