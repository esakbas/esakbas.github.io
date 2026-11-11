import { mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const root=resolve(import.meta.dirname,'..');
process.env.XDG_CACHE_HOME ||= join(root,'work','.cache');
mkdirSync(process.env.XDG_CACHE_HOME,{recursive:true});
const vendor=join(root,'public/vendor');mkdirSync(vendor,{recursive:true});
for(const [source,dest] of [['quill/dist/quill.js','quill.js'],['quill/dist/quill.snow.css','quill.css'],['turndown/dist/turndown.js','turndown.js']])copyFileSync(join(root,'node_modules',source),join(vendor,dest));
for(const p of ['src','scripts','public','tests']){for(const f of readdirSync(join(root,p))){const path=join(root,p,f);if(statSync(path).isFile()&&f.endsWith('.js'))execFileSync(process.execPath,['--check',path],{stdio:'pipe'});}}
await sharp(join(root,'public/social.svg')).resize(1200,630).jpeg({quality:85}).toFile(join(root,'public/social.jpg'));
console.log('Derleme tamamlandı: yerel editör dosyaları, JPEG paylaşım görseli ve JavaScript sözdizimi doğrulandı.');
