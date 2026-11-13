import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// A new URL when the artwork changes also refreshes browsers' favicon caches.
export async function buildIcons(source, output) {
  const svg = await readFile(source);
  const version = createHash('sha256').update(svg).digest('hex').slice(0, 12);
  const icons = {
    svg: `/assets/favicon-${version}.svg`,
    png: `/assets/favicon-${version}-32.png`,
    apple: `/assets/favicon-${version}-180.png`
  };
  const [small, apple] = await Promise.all([
    sharp(svg).resize(32, 32).png().toBuffer(),
    sharp(svg).resize(180, 180).png().toBuffer()
  ]);
  // ICO supports an embedded PNG; no extra encoder or runtime dependency.
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2);ico.writeUInt16LE(1, 4);
  ico[6] = 32;ico[7] = 32;
  ico.writeUInt16LE(1, 10);ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(small.length, 14);ico.writeUInt32LE(22, 18);
  await mkdir(join(output, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(join(output, icons.svg), svg),
    writeFile(join(output, icons.png), small),
    writeFile(join(output, icons.apple), apple),
    writeFile(join(output, 'favicon.ico'), Buffer.concat([ico, small])),
    writeFile(join(output, 'favicon.png'), small),
    writeFile(join(output, 'apple-touch-icon.png'), apple)
  ]);
  return icons;
}
