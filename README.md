# Hindiba — Eşref Akbaş'ın hatıra defteri

Hindiba'nın mevcut Türkçe yazılarını koruyan okuyucu sitesi ve yönetim paneli. Yazı oluşturma, taslak, önizleme, yayımlama, yayından kaldırma ve fotoğraf yükleme panelden yapılır. Yeni yayımlama işlemleri GitHub Issues'a bağlı değildir.

Uygulama sade HTML/CSS/JavaScript ön yüzü, Node.js 24/Express sunucusu, SQLite veritabanı ve yerel kalıcı görsel depolaması kullanır. Zengin metin düzenleme isteğe bağlıdır; özgün Markdown metnini korumak için varsayılan düzenleyici Markdown'dır.

## Hızlı başlangıç

Node.js **24 LTS** kurulu olmalıdır. Komutları bu dosyanın bulunduğu proje klasöründe çalıştırın.

```sh
npm ci
cp .env.example .env
npm run build
npm run import
npm run verify
npm run admin:create
npm run dev
```

Windows'ta `cp` yerine `.env.example` dosyasının bir kopyasını `.env` adıyla oluşturabilirsiniz. Yönetici oluşturma komutu kullanıcı adı ve parolayı etkileşimli olarak ister. Parolayı komut satırına veya kaynak koda yazmayın. Hazır yönetici hesabı yoktur.

Okuyucu sitesi `http://localhost:3000`, panel `http://localhost:3000/admin` adresindedir. `.env` içindeki portu değiştirirseniz `SITE_URL` değerini de aynı adresle güncelleyin. `npm run import` paket içindeki kaynak yedeğini kullanır; yeniden çalıştırılması aynı yazıları çoğaltmaz ve panelde düzenlenmiş kayıtları ezmez.

## İçerik ve yedek durumu

- GitHub kaynağından erişilebilen **9 gerçek blog yazısı** korunur. Yazı olmayan 1 pull request içerik olarak alınmaz.
- Bilinen Firestore kaynakları okunmuştur: 12 istatistik belgesi ve 0 yorum. GitHub issue yorumu sayısı da 0'dır.
- Firestore'daki üç ek kimliğin tam yazı metni mevcut GitHub API yanıtında yoktur; bu kayıtlar kurtarılmış yazı gibi gösterilmez. Kimlikler ve sınırlar [inceleme raporunda](docs/INCELEME.md) açıklanır.
- Kod arşivi ve dış kaynakların ham REST yedeği, checksum bilgileriyle teslim edilir. Firebase'in tüm proje ayarları ve Auth kullanıcıları bu REST yedeğinin kapsamında değildir.
- GitHub Issues ve Firebase'deki kaynak kayıtlar silinmemiştir. Canlı site değiştirilmemiş, ücretli hizmet başlatılmamıştır.

## Günlük kullanım ve işletim

| İhtiyaç | Belge / komut |
| --- | --- |
| Yeni yazı ekleme, fotoğraf yükleme, taslak ve yayımlama | [Kullanım rehberi](docs/KULLANIM.md) |
| Kurulum, ortam değişkenleri, testler ve dosya yapısı | [Kurulum rehberi](docs/KURULUM.md) |
| Kaynakların incelenmesi, içerik sayıları ve erişim sınırları | [İnceleme raporu](docs/INCELEME.md) |
| Ekonomik barındırma, yedekleme, canlı geçiş ve geri dönüş | [Yayın ve geri dönüş rehberi](docs/YAYIN-VE-GERI-DONUS.md) |
| Eski GitHub Pages bağlantıları için yerel köprü hazırlama | `npm run pages:bridge -- --target https://NEW_DOMAIN --out work/pages-bridge` — yayımlama onayından sonra eski Pages kaynağında kullanılır. |
| Son teslim sonuçları ve çalıştırılamayan kontroller | [Doğrulama raporu](docs/DOGRULAMA.md) |
| Uygulama kontrolleri | `npm test` ve `npm run build` |
| Aktarım karşılaştırması | `npm run verify` |

GitHub Pages bu sunucu uygulamasını çalıştıramaz. Canlı yayın için HTTPS ve kalıcı diskli bir Node.js ortamı gerekir. Ücretsiz deneme ortamının geçici diski, yazı ve fotoğraflar için uygun değildir. Seçilecek hizmetin güncel maliyeti ve geri dönüş planı onaylanmadan canlı yayına geçilmemelidir.

## GitHub üzerinden otomatik kontroller

`codex/hindiba-cms-*` geliştirme dallarına gönderim ve `main` hedefli pull request açılması GitHub Actions kontrollerini başlatır. Akış Node.js 24 üzerinde derleme, 19 uygulama/içerik testi, gerçek kaynaklardan tekrar çalıştırılabilir aktarım, hash karşılaştırması, bağımlılık taraması ve Chromium ile yönetim paneli/okuyucu testlerini yürütür. Raporlar ve tarayıcı ekran görüntüleri ilgili Actions çalışmasının `hindiba-verification-*` çıktısındadır.

Bu iş akışı siteyi yayımlamaz. `main` dalı ve eski kök `index.html`, CSS ve `pp.jpg` dosyaları korunur; Node.js uygulaması `src/` ve `public/` üzerinden çalışır. GitHub Pages mevcut statik siteyi sunmaya devam eder. Canlı yönetim paneli için ayrıca kalıcı diskli barındırma ve onaylı geçiş gerekir.

Tarayıcı testlerini kendi makinenizde çalıştırmak isterseniz `npm ci`, `npm run build`, `npx playwright install chromium` ve `npm run test:e2e` kullanın. Test kullanıcısı ve yazıları yalnızca geçici test veritabanında oluşturulur; gerçek `DATA_DIR` değiştirilmez.
