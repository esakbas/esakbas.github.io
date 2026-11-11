# Barındırma, yedekleme ve geri dönüş

Bu teslim ayrı bir geliştirme kopyasıdır. Canlı GitHub Pages sitesi değiştirilmemiş ve ücretli hizmet başlatılmamıştır. Kullanıcının mevcut Node.js sunucusu olmadığı için aşağıdaki seçenekler karar vermeyi kolaylaştırır. Sağlayıcıların fiyatları, vergi ve ücretsiz plan koşulları değişebilir; bu belgede güncel olarak doğrulanmamış bir aylık fiyat verilmez.

## Hangi barındırma uygun?

Uygulama **Node.js 24, HTTPS, yeniden başlatmalarda korunan yerel disk ve sunucu dışı yedek** ister. Uygulama kodunun Git deposunda olması, SQLite dosyasının ve yüklenen fotoğrafların yedeği yerine geçmez. Tek uygulama örneğiyle çalıştırın; farklı makinelerin aynı SQLite dosyasını paylaşması bu tasarımın kapsamında değildir.

| Seçenek | Maliyet ve uygunluk | Bakım / dikkat edilecek nokta |
| --- | --- | --- |
| Kendi bilgisayarınızda yerel çalışma | Yazılım lisansı ücretsiz; geliştirme ve içerik incelemesi için uygundur. | Bilgisayar açık değilken site erişilemez; sürekli canlı yayın çözümü değildir. |
| Ücretsiz kalıcı VM kotası; ör. Oracle Cloud Always Free | Uygun hesap, bölge ve kapasitede ücretsiz kota bulunabilir. Hesap koşulları ve kota dışı ücretler açılışta doğrulanmalıdır. | Kapasite bulunması garanti değildir. İşletim sistemi, HTTPS ve yedekleri yönetmek gerekir. Ücretli kaynağa geçiş otomatik başlatılmamalıdır. |
| Küçük VPS; ör. Hetzner, DigitalOcean veya OVHcloud | İşlemci/RAM ve disk için düzenli ücret; alan adı, ek disk, trafik ve yedek fiyatı ayrıca kontrol edilir. | Tek yazarlı blog için sade bir dağıtım sağlar. Sunucu güncellemeleri ve güvenliği işletmecinin sorumluluğundadır. |
| Kalıcı volume destekli PaaS; ör. Railway veya uygun Render hizmeti | Uygulama, kalıcı disk ve varsa trafik/yedek bedelleri birlikte hesaplanmalıdır. Ücretsiz uygulama kotası kalıcı diski kapsamayabilir. | Kurulum daha kolay olabilir. Yeniden dağıtımda diskin korunması ve uygulamanın tek örnek çalışması doğrulanır. |
| Ücretsiz statik GitHub Pages | Mevcut site için kullanılabilir; bu Node.js uygulamasını çalıştıramaz. | Pages üzerinde kalmak için içerik dosyaları ve Decap CMS/OAuth gibi ayrı bir çözüm gerekir; teslimdeki panelin doğrudan yüklenmesi yeterli değildir. |

Güncel koşulları incelemek için sağlayıcıların kendi sayfaları kullanılabilir: [Oracle Free Tier](https://www.oracle.com/cloud/free/), [Hetzner Cloud](https://www.hetzner.com/cloud/), [DigitalOcean fiyatları](https://www.digitalocean.com/pricing), [Railway fiyatları](https://railway.com/pricing) ve [Render fiyatları](https://render.com/pricing). Bu bağlantılar bir hizmet başlatmaz; hesap ve plan seçimi ayrıca yapılır.

İlk ekonomik seçenek olarak, işletimi güvenilir biçimde üstlenebilen biri varsa küçük bir kalıcı diskli VPS düşünülebilir. Sunucu bakımı istenmiyorsa kalıcı disk sunan yönetilen bir hizmetin toplam ücreti karşılaştırılmalıdır. Sadece geçici dosya sistemi sunan ücretsiz deneme hizmetine gerçek yazı ve fotoğrafları bırakmayın.

## Canlıya geçmeden önce onaylanacak somut bilgiler

Kurulumu yapan kişi şu bilgileri kullanıcıya birlikte sunmalıdır:

1. Sağlayıcı, plan, bölge, aylık ücret ve vergi; varsa alan adı, kalıcı disk, trafik ve yedek ücretleri.
2. Yeni HTTPS adresi ve mevcut `esakbas.github.io` bağlantılarının nasıl korunacağı.
3. Kalıcı veri yolu, yedeğin nereye ve ne sıklıkta alınacağı, saklama süresi.
4. Deneme ortamındaki yazı sayısı ve yönetici giriş/yazı/fotoğraf/yayımlama kontrollerinin sonucu.
5. Eski siteye geri dönüş için kullanılacak kod yedeği ve yeni yazıların nasıl korunacağı.

Bu bilgilerle onay alınmadan ücretli kaynak oluşturulmamalı ve canlı yayın/donanım alan adı ayarı değiştirilmemelidir. Yerel kurulum, içerik karşılaştırması ve yedek hazırlama bu onayı beklemeden yapılabilir.

## Üretim kurulumu

Sağlayıcı belirlendikten sonra uygulanacak sıra:

1. Üretimden ayrı bir deneme ortamı hazırlayın. Node.js 24 ve uygulama bağımlılıklarını kurun.
2. `DATA_DIR` için kalıcı bir dizin/volume bağlayın. Uygulama kullanıcısının bu dizine yazabildiğini, diğer kullanıcıların özel verilere erişemediğini doğrulayın.
3. Kod kopyasında `npm ci` ve `npm run build` çalıştırın. `public/` dışında veritabanı ve kaynak yedekler için rastgele statik sunucu açmayın.
4. `.env` veya barındırma panelindeki değişkenleri yapılandırın: gerçek HTTPS `SITE_URL`, kalıcı `DATA_DIR`, `NODE_ENV=production`, port ve güvenilir ters vekil ayarı.
5. `npm run import` ve `npm run verify` çalıştırın. Yeni veri dizininde yönetici hesabını `npm run admin:create` ile oluşturun. Yerel test hesabını üretime taşımayın.
6. Uygulamayı yeniden başlatma durumunda otomatik açan bir hizmet yöneticisiyle `npm start` çalıştırın. Sağlayıcının HTTPS/ters vekil ayarlarını yapın. Sunucuya doğrudan dış erişimi kapatmadan `TRUST_PROXY=true` kullanmayın.
7. Test taslağı oluşturun, fotoğraf yükleyin, önizleyin, yayımlayın, yayından kaldırın. Uygulamayı yeniden dağıtıp/başlatıp verilerin korunduğunu kontrol edin.
8. Yedek alın ve ayrı bir dizine geri yüklemeyi deneyin. Yalnız yedek komutunun başarılı olması yeterli değildir; geri açılan içerik de kontrol edilmelidir.
9. Kullanıcı onayından sonra alan adı ve eski site köprüsünü değiştirin. Sayfa başlıklarını, canonical adreslerini, RSS'i ve sitemap'i gerçek alan adıyla kontrol edin.

Canlı açılışa kadar eklenen yeni GitHub yazısı veya yorum varsa son bir salt okunur kaynak yedeği alınıp aktarım farkı incelenmelidir. Bu teslimdeki yedek, 11 Kasım 2026 tarihinde alınan anlık kopyadır.

## Eski adresler ve alan adı

Mevcut yazı bağlantıları `https://esakbas.github.io/#post-6210660748` gibi URL parçası kullanır. `#` sonrasını tarayıcı sunucuya göndermez. Yeni uygulama bu kimlikleri tanır ve karşılık gelen yazıyı açar; sunucu tarafı HTTP 301 yalnız yeni `/yazi/...` yollarında uygulanabilir.

`esakbas.github.io` GitHub'a ait alan adıdır; DNS'i başka bir Node.js sunucusuna yönlendirmek mümkün değildir. Yeni site başka bir alan adına geçerse eski Pages ana sayfasında küçük bir uyumluluk/yönlendirme köprüsü yayımlanmalıdır. Bu işlem canlı siteyi değiştirir ve kullanıcı onayı gerektirir. Eski ana sayfayı yeni alan adına gelişigüzel yönlendirmek yazı eşleştirmesini kaybettirebilir.

Köprünün dosyalarını yerel olarak hazırlamak için yeni sitenin gerçek HTTPS adresini kullanın:

```sh
npm run pages:bridge -- --target https://NEW_DOMAIN --out work/pages-bridge
```

`NEW_DOMAIN` yerine yayına hazır yeni alan adını yazın; bu örnek adresi aynen yayımlamayın. Hedef yalnız HTTPS kök adresi olmalıdır; alt yol, kullanıcı adı veya URL parametresi eklemeyin. Komut `index.html`, `bridge.js`, `.nojekyll` ve açıklayıcı `README.txt` dosyalarını `work/pages-bridge` içine üretir. Aktarımı yapılmış veritabanındaki yayımlanmış yazıların eski issue kimliklerini ve güncel adreslerini kullanır; önce doğru `DATA_DIR` ile aktarımın ve yazı durumlarının hazır olduğunu doğrulayın. Önceki köprüyü korumak için çıktıda zaten `index.html` varsa yeni bir hedef klasör seçin. Bu hazırlık komutu Pages'e dosya göndermez veya canlı siteyi değiştirmez.

Köprü tarayıcıda `#post-<issue.id>` parçasını okur ve bilinen kimlik için `location.replace` ile yeni yazı adresini açar. JavaScript olmadan ana sayfaya giden bağlantı ve meta yenileme geri dönüşü vardır. Bu bir HTTP 301 değildir; eski URL parçası sunucuya ulaşmaz. Yeni sitenin içinde eski kimlik eşleştirmesi ayrıca korunur.

Yeni sitenin içeriği doğrulandıktan ve **eski Pages sitesini değiştirme onayı alındıktan sonra**, üretilmiş `index.html`, `bridge.js` ve `.nojekyll` dosyaları eski Pages yayın kaynağının köküne yüklenir; `README.txt` açıklama içindir. Önce eski Pages dosyalarının yedeğini koruyun. En az bir eski `#post-...` bağlantısını ve eski ana sayfayı açıp doğru hedefe gittiklerini kontrol edin. Köprü dosyalarını yeni Node.js uygulamasının yerine koymayın; bunlar yalnız eski statik Pages yayını içindir. Geri dönüş gerektiğinde eski Pages dosyalarını yedekten geri koyun.

Yeni uygulamada bir yazının adresini panelden değiştirince eski `/yazi/<adres>` için 301 eşleştirmesi veritabanında saklanır. Bu yönlendirme yalnız yazı yayımdaysa okuyucuya hizmet vermelidir; taslak içeriği açık etmemelidir.

## Yedek nasıl alınır?

Komutları proje klasöründe çalıştırın. Aşağıdaki tarihler örnektir; her yedek için yeni bir hedef adı kullanın.

```sh
npm run backup -- --data data --source content/source-backup --out work/backup-20261111
```

`--data` verilmezse `DATA_DIR` kullanılır. Hedef dizin daha önce var olmamalı ve veri dizininin dışında olmalıdır. Veritabanı tutarlı bir SQLite `VACUUM INTO` anlık kopyasıyla alınır; görseller, özel özgün dosyalar, aktarım eşleştirmeleri ve kaynak yedeği de checksum manifestiyle kopyalanır. Yedek içinde bir dosyanın boyutu veya SHA-256 özeti değişirse geri yükleme doğrulaması hata verir.

Uygulama açıkken veritabanı kopyası tutarlı alınabilir; veritabanı ve görsel dosyalarının aynı işletim anını temsil etmesini garanti etmek için yedek sırasında yeni yazı/fotoğraf kaydetmeyin. En açık işletim yöntemi, kısa bir bakım aralığında uygulamayı durdurup yedek almak ve sonra başlatmaktır.

Yedek klasörü yönetici parola özetleri ve oturum verileri gibi özel bilgiler içerir. Herkese açık Git deposuna, `public/` klasörüne veya bir indirme bağlantısına koymayın. Sunucu dışındaki erişim kontrollü bir yerde saklayın; gerekiyorsa güvenilir bir yedekleme aracıyla şifreleyin. Yedek komutu `.env` veya tüm sunucu yapılandırmasını otomatik yedeklemiş sayılmaz; HTTPS/servis ayarlarını ve gerekli gizli işletim bilgilerini ayrı, güvenli biçimde koruyun.

Bir başlangıç programı olarak günlük otomatik yedek, değişiklik öncesi ek yedek ve aylık geri yükleme denemesi kullanılabilir. Saklama süresi ve yedek depolama maliyeti kullanıcıyla belirlenir. Tek kopyayı uygulamanın çalıştığı diskte tutmayın.

## Yedeği geri yükleme

Geri yükleme mevcut verilerin üzerine yazmaz. Yeni hedef yol **hiç var olmamalıdır**:

```sh
npm run restore -- --backup work/backup-20261111 --to data-restored-20261111
```

Komut önce checksum/byte boyutlarını ve SQLite bütünlüğünü kontrol eder; hata varsa etkin veriyi değiştirmeden durur. Geri yüklenen oturumlar temizlenir; yönetici yeniden giriş yapar.

Geri yüklenen kopyayı etkinleştirmek için:

1. Uygulamayı durdurun ve mevcut veri dizinini yerinde koruyun.
2. `.env` veya barındırma ayarındaki `DATA_DIR` değerini yeni geri yüklenen dizine çevirin.
3. Uygulamayı başlatın; yönetici girişi, yazı sayısı ve birkaç fotoğrafı kontrol edin.
4. Sorun varsa uygulamayı tekrar durdurup `DATA_DIR` değerini önceki dizine döndürün. Doğrulanmadan eski veriyi silmeyin.

Yedekten sonraki yeni yazılar ve fotoğraflar o eski yedekte bulunmaz. Geri dönüşten önce güncel veri dizininin de ayrı yedeğini alın; iki farklı tarihin verilerini elle SQLite dosyası kopyalayarak birleştirmeyin.

## İlk siteye geri dönüş

İlk kodun değiştirilmemiş ZIP'i ve hash manifesti eski okuyucu sitesini geri hazırlamak içindir; bu yedek yeni uygulamadan ayrı teslim edilir. GitHub Issues/Firebase kayıtları silinmediği için eski site önceki kaynakları kullanmaya devam edebilir. Canlıda hangi dal/dizin ve özel alan adı kullanıldığı yayımlamadan önce kayda alınmalıdır; yalnız ZIP açılması hesabın Pages ayarlarını geri getirmez.

Geri dönüş gerektiğinde önce yeni uygulamanın güncel verilerini yedekleyin. Yeni panelde yazılan içerikler GitHub Issues'a otomatik yazılmaz; eski okuyucu siteye dönmek bu yeni yazıları orada görünür yapmaz. Veriyi koruyup geçiş planını belirlemeden yeni uygulama dizinini kaldırmayın. Eski Pages kaynağını ve varsa alan adı ayarını önceki doğrulanmış haline getirip ana sayfa ile birkaç eski `#post-...` bağlantısını kontrol edin.
