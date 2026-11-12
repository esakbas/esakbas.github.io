import { readFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, join, sep, basename } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import sanitizeHtml from 'sanitize-html';
import { renderMarkdown } from './markdown.js';

export function referencedMedia(posts) {
  const urls = new Set();
  const add = url => {
    if (url?.startsWith('/uploads/')) urls.add(url.split(/[?#]/)[0]);
  };
  for (const post of posts) {
    add(post.cover);
    // Match only images that survive Markdown rendering and sanitization. Code
    // examples and HTML comments must never publish otherwise private media.
    sanitizeHtml(renderMarkdown(post.body), {
      allowedTags: ['img'],
      allowedAttributes: { img: ['src'] },
      transformTags: {
        img: (tagName, attribs) => { add(attribs.src);return { tagName, attribs }; }
      }
    });
  }
  return [...urls];
}
export async function buildMedia(posts, mediaDir, outputDir) {
  const mapping = {}, root = resolve(mediaDir), emitted = new Set();
  for (const url of referencedMedia(posts)) {
    let decoded;
    try { decoded = decodeURIComponent(url.slice('/uploads/'.length)); } catch { throw new Error('Görsel adresi geçersiz.'); }
    if (!decoded || decoded !== basename(decoded) || /[\\\0]/.test(decoded)) throw new Error('Görsel dosya yolu güvenli değil.');
    const path = resolve(root, decoded);
    if (!path.startsWith(root + sep)) throw new Error('Görsel yolu özel dizinin dışına çıkıyor.');
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Görsel normal bir dosya olmalı.');
    const bytes = await readFile(path);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('Görsel en fazla 10 MB olabilir.');
    let metadata;
    try { metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata(); }
    catch { throw new Error('Görsel okunamadı veya 40 megapiksel sınırını aşıyor.'); }
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) throw new Error('Yalnızca gerçek JPEG, PNG, WebP ve GIF görselleri yayımlanabilir.');
    const key = createHash('sha256').update(bytes).digest('hex').slice(0, 32), file = key + '.webp';
    if (!emitted.has(file)) {
      await mkdir(join(outputDir, 'uploads'), { recursive: true });
      await sharp(bytes, { limitInputPixels: 40_000_000, animated: false }).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(outputDir, 'uploads', file));
      emitted.add(file);
    }
    mapping[url] = '/uploads/' + file;
  }
  return mapping;
}
