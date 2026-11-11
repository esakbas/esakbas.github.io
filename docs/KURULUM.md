# Kurulum ve yerel çalıştırma

## Gereksinimler

- Node.js **24 LTS** ve beraberindeki npm.
- Yazılabilir bir kalıcı veri dizini. Uygulama yerel diskte SQLite ve fotoğraf dosyaları tutar.
- İlk `npm ci` kurulumu için npm paketlerine internet erişimi. Paket içindeki kaynak içerikleri aktarmak ve siteyi çalıştırmak için GitHub erişimi gerekmez.
- Üretimde HTTPS ve güvenilir bir ters vekil veya HTTPS sağlayan barındırma.

Proje Node.js 24'ün yerleşik `node:sqlite` modülünü kullanır; ayrıca PostgreSQL, MySQL veya Firebase hesabı açmanız gerekmez. İkinci bir uygulama kopyasını aynı SQLite dosyasıyla farklı makinelerde çalıştırmayın; bu kurulum tek sunucu içindir.

## İlk kurulum

Arşivi yeni bir klasöre açın. Eski deponun veya canlı yayın klasörünün üzerine doğrudan açmayın. Terminalde proje klasörüne geçin:

```sh
npm ci
cp .env.example .env
npm run build
npm run import
npm run verify
npm run admin:create
npm run dev
```

Windows'ta `.env.example` dosyasını dosya yöneticisinden kopyalayıp `.env` olarak adlandırabilirsiniz. `.env` bir düz metin dosyasıdır; dosya adının yanlışlıkla `.env.txt` olmadığını kontrol edin.

`npm run build`, yerel editör varlıklarını hazırlar ve kaynak kodu kontrol eder. Node.js uygulaması çalıştırıldığında sayfalar sunucuda oluşturulur; sonuç klasörünü GitHub Pages'e yüklemek yeterli değildir.

Yönetici oluşturma komutunun sorularını yanıtlayın. Kullanıcı adı boşluksuz, parola en az 12 karakter olmalıdır. Güçlü, başka bir hizmette kullanmadığınız bir parola seçin. `.env` dosyasına yönetici parolası eklenmez. SQLite'ta scrypt parola özeti saklanır; düz parola saklanmaz. Komutun çıktısı hesabın oluşturulduğunu doğrulamadan giriş yapmayı denemeyin.

Parola unutulursa sunucuya yetkili erişimi olan kişi `npm run admin:create -- --reset` çalıştırıp mevcut kullanıcı adını ve yeni parolayı girebilir. Bu işlem ilgili yöneticinin açık oturumlarını kapatır. Parolayı komut argümanına yazmayın; komut etkileşimli olarak ister.

Yerel siteyi `http://localhost:3000`, paneli `http://localhost:3000/admin` adresinde açın. Sunucuyu terminalde `Ctrl+C` ile durdurabilirsiniz. Yeniden başlatmak için `npm run dev` yeterlidir; her açılışta yeniden aktarım veya yönetici oluşturma gerekmez.

## Ortam değişkenleri

`npm run dev`, `npm start` ve veri yönetimi komutları proje kökündeki `.env` dosyasını Node.js ile okur. Barındırma panelinden verilen ortam değişkenleri de kullanılabilir; sırları Git'e eklemeyin.

| Değişken | Yerel örnek | Açıklama |
| --- | --- | --- |
| `PORT` | `3000` | Sunucunun dinlediği port. Sağlayıcının verdiği değer üretimde kullanılabilir. |
| `SITE_URL` | `http://localhost:3000` | Ziyaretçinin kullandığı tam kök adres. Canonical, RSS ve sitemap için üretimde `https://` ile gerçek alan adını yazın. |
| `DATA_DIR` | `./data` | SQLite, yüklemeler ve özel özgün fotoğrafların tutulduğu klasör. Üretimde kalıcı diske bağlanmış mutlak yol kullanın. |
| `NODE_ENV` | `development` | Üretimde `production` yapın; güvenli oturum çerezi HTTPS gerektirir. |
| `TRUST_PROXY` | `false` | Yalnız güvenilir bir ters vekil arkasında ve sunucuya doğrudan dış erişim kapalıyken `true` yapın. |

Üretim örneği:

```dotenv
PORT=3000
SITE_URL=https://blog.alanadiniz.com
DATA_DIR=/var/lib/hindiba
NODE_ENV=production
TRUST_PROXY=true
```

Bu örnekteki alan adı ve veri yolu size ait değerlerle değiştirilir. Yönetici parolası, GitHub tokenı veya Firebase servis hesabı anahtarı gerektirmez. Barındırma erişim bilgilerinizi kaynak dosyalara, tarayıcıya sunulan JavaScript'e veya ekran görüntülerine eklemeyin.

## İsteğe bağlı Docker kurulumu

`Dockerfile` ve `compose.yaml` dağıtım başlangıcı olarak verilmiştir. Teslimde npm kurulumu ve uygulama testleri çalıştırılmıştır; **Docker image derlemesi ve konteyner akışı çalıştırılmamıştır**. Konteyneri kullanmadan önce ayrı deneme ortamında doğrulayın.

Compose, veriyi `hindiba-data` adlı kalıcı volume içinde tutar ve portu sunucunun `127.0.0.1:3000` adresine bağlar. `SITE_URL` gerçek HTTPS adresi olmalı; bu adres için güvenilir ters vekil/HTTPS ayrıca kurulmalıdır. Hazırlanan sunucuda sıra şöyledir:

```sh
docker compose build
docker compose run --rm blog npm run import
docker compose run --rm blog npm run admin:create
docker compose up -d
```

Bu yolda kullanılan veriler bilgisayardaki `./data` klasörüyle aynı değildir; named volume içindedir. Yedekleri konteynerin geçici dosya sisteminden kalıcı, erişim kontrollü bir dış hedefe çıkarın ve geri yüklemeyi deneyin. Volume'ü silen bir işlem yazı ve fotoğrafları da siler. Doğrulanmış npm kurulumu tercih edilirse Docker kullanmak zorunlu değildir.

## Komutlar

| Komut | İşlev |
| --- | --- |
| `npm ci` | Kilit dosyasındaki bağımlılıkları kurar. |
| `npm run build` | Editörün yerel varlıklarını hazırlar ve kaynakları kontrol eder. |
| `npm run dev` / `npm start` | Node.js sunucusunu başlatır; sürekli çalıştırma üretim ortamının sorumluluğudur. |
| `npm run admin:create` | Etkileşimli yönetici hesabı oluşturma komutu. |
| `npm run import` | Saklanan kaynak yedeğinden yazıları aktarır; mevcut kaynak kimliklerini çoğaltmaz. |
| `npm run verify` | Aktarılan içerikle ham kaynak arasındaki farkları ve içerik sayılarını raporlar. |
| `npm test` | Otomatik uygulama ve aktarım testlerini çalıştırır. |
| `npm run backup` | Veritabanı ve dosyalar için geri yüklenebilir yedek hazırlar. |
| `npm run restore -- ...` | Yedeği yeni ve boş bir veri dizinine geri yükler. Ayrıntılar yayın rehberindedir. |
| `npm run pages:bridge -- --target https://NEW_DOMAIN --out work/pages-bridge` | Yeni alan adına geçiş için eski Pages yayınına konabilecek statik köprüyü yerelde üretir. Kendisi canlıya dosya göndermez. |

## Veriler ve dosyalar

`public/` yalnızca tarayıcıya sunulması gereken varlıkları içerir. SQLite veritabanı, yönetici parola özetleri, oturumlar, yedekler ve özgün yüklemeler bu klasöre taşınmaz. `DATA_DIR` içindeki `uploads/` klasörünün optimize edilmiş kopyaları uygulama tarafından `/uploads/` yolunda sunulur; `originals/` özel kalır.

Eski kodun değiştirilmemiş ZIP yedeği ayrı teslim edilir; yeni uygulama eski Firebase yapılandırmasını kullanmaz. Kaynak yedeğindeki ham GitHub/Firebase verilerini değiştirmeyin. Aktarımın kaynak kayıtları ve panelde düzenlenmiş güncel kayıtlar farklı amaçlarla saklanır.

## Çalıştığını kontrol etme

```sh
npm run build
npm test
npm run verify
```

Komutlar hata verirse hatayı çözmeden üretime geçmeyin. Aktarılmış bir yazıyı panelde bilerek düzenledikten sonra ham kaynakla birebir karşılaştırmada fark görülmesi beklenebilir; böyle bir farkı silerek veya tekrar aktararak kapatmayın. Önce kaynak metadata ile güncel sürümün amaçlı farkını inceleyin.

Yerel olarak bir test taslağı oluşturun, fotoğraf yükleyin, önizleyin, yayımlayın ve tekrar yayından kaldırın. Ardından uygulamayı durdurup yeniden açarak taslak ve fotoğrafın durduğunu kontrol edin. Son teslimde otomatik kontrollerin ve çalıştırılamayan kontrollerin ayrı raporlandığı doğrulama belgesini de okuyun.

## Yaygın sorunlar

| Belirti | Kontrol |
| --- | --- |
| `node:sqlite` veya Node sürümü hatası | `node --version` çıktısı 24 olmalı; farklı terminalde eski Node kullanılıyor olabilir. |
| Panelde editör araçları yüklenmiyor | `npm ci` ve `npm run build` komutlarını çalıştırın. |
| Giriş başarılı görünse de oturum açılmıyor | Yerel HTTP için `NODE_ENV=development`; üretimde HTTPS, `SITE_URL` ve ters vekil ayarlarını kontrol edin. |
| Kaydetme/yükleme reddediliyor | Aynı alan adındaki paneli kullanın; oturumu yeniden açın, dosya türü/boyutu ve veri dizininin yazma iznini kontrol edin. |
| Yeniden başlatınca fotoğraflar kayboluyor | `DATA_DIR` geçici diskte olabilir; yeni içerik eklemeden önce kalıcı disk ve yedek kurulumunu düzeltin. |
| Sayfa adresleri yanlış alan adını gösteriyor | `SITE_URL` değerini gerçek HTTPS adresi yapıp uygulamayı yeniden başlatın. |
