// Browser-test fixture only. Never reads DATA_DIR or creates a production account.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { openDatabase, hashPassword } from '../src/db.js';
import { importIssues } from './import-issues.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(join(tmpdir(), 'hindiba-browser-'));
const port = 4173;
const siteUrl = `http://127.0.0.1:${port}`;
const username = 'editor';
// This known password exists only in the isolated, disposable browser fixture.
const password = process.env.E2E_PASSWORD || 'Browser-fixture-only!2026';
let app, server, cleaning = false;
function cleanup(exitCode = 0) {
  if (cleaning) return;
  cleaning = true;
  const finish = () => {
    try { app?.locals.db.close(); } finally {
      rmSync(dataDir, { recursive: true, force: true });
      process.exitCode = exitCode;
    }
  };
  if (server) {
    server.close(finish);
    server.closeAllConnections();
  } else finish();
}
try {
  const imported = importIssues({ sourceDir: join(root, 'content/source-backup'), dataDir });
  if (imported.sourcePosts !== 9 || imported.inserted !== 9) throw new Error('Browser fixture must include all nine archived articles.');
  const db = openDatabase(dataDir);
  db.prepare('INSERT INTO admins(id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(randomUUID(), username, hashPassword(password), new Date().toISOString());
  db.close();
  app = createApp({ dataDir, siteUrl, production: false, trustProxy: false });
  server = app.listen(port, '127.0.0.1', () => console.log(`Isolated browser fixture ready at ${siteUrl}`));
  server.on('error', error => { console.error(error.message); cleanup(1); });
  process.on('SIGTERM', () => cleanup());
  process.on('SIGINT', () => cleanup());
} catch (error) {
  console.error(error.message);
  cleanup(1);
}
