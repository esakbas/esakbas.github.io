import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(32).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password, encoded) {
  try {
    const [kind, salt, stored] = encoded.split('$');
    if (kind !== 'scrypt' || !/^[a-f0-9]{64}$/.test(salt) || !/^[a-f0-9]{128}$/.test(stored)) return false;
    const actual = scryptSync(password, salt, 64);
    return timingSafeEqual(actual, Buffer.from(stored, 'hex'));
  } catch { return false; }
}
export function openDatabase(dataDir) {
  const directory = resolve(dataDir);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dbPath = join(directory, 'hindiba.sqlite');
  const db = new DatabaseSync(dbPath);
  chmodSync(dbPath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      legacy_id TEXT UNIQUE,
      source_key TEXT UNIQUE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      cover_alt TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'gunluk',
      tags TEXT NOT NULL DEFAULT '[]',
      author TEXT NOT NULL DEFAULT 'Eşref Akbaş',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
      source_json TEXT
    );
    CREATE INDEX IF NOT EXISTS posts_status_date ON posts(status, created_at);
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      author TEXT NOT NULL DEFAULT 'Anonim',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      source_json TEXT
    );
    CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created_at);
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL UNIQUE,
      mime TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      alt TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES admins(id),
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS redirects (
      old_slug TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id)
    );
  `);
  return db;
}
