import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const index = process.argv.indexOf('--out');
const target = resolve(index >= 0 ? process.argv[index + 1] : `work/backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
if (existsSync(target)) throw new Error('Yeni bir yedek dizini seçin; önceki yedeğin üzerine yazılmaz.');
try { execFileSync('git', ['rev-parse','--git-dir'], { stdio:'pipe' }); } catch { throw new Error('Önce özel GitHub deponuzu klonlayıp yedek komutunu o klasörde çalıştırın.'); }
mkdirSync(target, { recursive:true, mode:0o700 });
// Fetch every private draft branch, then save the complete reachable Git history.
execFileSync('git', ['fetch','origin','+refs/heads/*:refs/remotes/origin/*'], { stdio:'inherit' });
const file = join(target, 'hindiba-private.bundle');
execFileSync('git', ['bundle','create',file,'--all'], { stdio:'inherit' });
execFileSync('git', ['bundle','verify',file], { stdio:'inherit' });
const bytes = readFileSync(file);
writeFileSync(join(target,'manifest.json'),JSON.stringify({ createdAt:new Date().toISOString(), private:true, file:'hindiba-private.bundle', bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), restore:'git clone hindiba-private.bundle hindiba-restored. Bundle içindeki uzak taslak refs de korunur; gerekiyorsa git branch -a ile kontrol edin.', limitation:'Kaydedilmemiş yerel değişiklikler ve Cloudflare secrets Git bundle içinde değildir.' },null,2),{mode:0o600});
console.log('Özel yedek hazır: '+target+'. Herkese açık depoya yüklemeyin.');
