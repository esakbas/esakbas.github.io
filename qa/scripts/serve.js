import { buildSite } from './build.js';
import { serveStatic } from '../src/serve.js';
const port = Number(process.env.PORT || 3000);
await buildSite({ siteUrl: `http://localhost:${port}`, branch:'main' });
const server = serveStatic({ rootDir:'_site', port, host:'127.0.0.1' });
server.on('listening', () => console.log(`Yerel statik önizleme: http://localhost:${port}. Gerçek GitHub girişi Cloudflare ayarlarını gerektirir.`));
