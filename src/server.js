import { createApp } from './app.js';
const port=Number(process.env.PORT || 3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 1–65535 arasında olmalı.');
const app=createApp();
const server=app.listen(port,'0.0.0.0',()=>console.log(`Hindiba hazır: ${process.env.SITE_URL || `http://localhost:${port}`} · Yönetim: /admin`));
const shutdown=()=>server.close(()=>{app.locals.db.close();process.exit(0);});
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
