import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { openDatabase, hashPassword } from '../src/db.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let username, password, confirmation;
if (process.stdin.isTTY) {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    username = (await rl.question('Yönetici kullanıcı adı: ')).trim();
    process.stdout.write('Parola (en az 12 karakter; görünmez): ');
    muted = true;
    password = await rl.question('');
    muted = false;
    process.stdout.write('\nParola tekrar (görünmez): ');
    muted = true;
    confirmation = await rl.question('');
    muted = false;
    process.stdout.write('\n');
  } finally { muted = false; rl.close(); }
} else {
  // Automation may pass three newline-separated values through a secure stdin pipe.
  // Never accept a password in shell arguments or persist the input file.
  [username, password, confirmation] = readFileSync(0, 'utf8').split(/\r?\n/);
  username = username?.trim();
}
if (!username || username.length > 100 || /\s/.test(username)) throw new Error('Kullanıcı adı boşluksuz ve en fazla 100 karakter olmalı.');
if (!password || password.length < 12 || password.length > 1024) throw new Error('Parola 12–1024 karakter olmalı.');
if (password !== confirmation) throw new Error('Parolalar eşleşmiyor.');
const db = openDatabase(resolve(process.env.DATA_DIR || resolve(projectRoot, 'data')));
try {
  const existing = db.prepare('SELECT id FROM admins WHERE username=?').get(username);
  if (existing) {
    if (!process.argv.includes('--reset')) throw new Error('Bu yönetici zaten var. Parolayı yenilemek için --reset kullanın.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(password), existing.id);
      db.prepare('DELETE FROM sessions WHERE admin_id=?').run(existing.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    console.log('Parola yenilendi. Önceki yönetici oturumları kapatıldı.');
  } else {
    db.prepare('INSERT INTO admins(id,username,password_hash,created_at) VALUES (?,?,?,?)').run(randomUUID(), username, hashPassword(password), new Date().toISOString());
    console.log('Yönetici oluşturuldu. /admin adresinden giriş yapabilirsiniz.');
  }
} finally { db.close(); }
