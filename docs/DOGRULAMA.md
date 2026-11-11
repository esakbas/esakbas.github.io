# Teslim ve doğrulama raporu

11 Kasım 2026 · Türkiye saati. Çalışma, yüklenen ZIP'ten çıkarılan ayrı geliştirme kopyasında uygulandı. Canlı GitHub Pages, GitHub Issues ve Firebase üzerinde yazma/silme yapılmadı; ücretli hizmet açılmadı.

## Geliştirilen uygulama

Hindiba adı, Eşref Akbaş profili, Türkçe edebiyat kimliği, profil fotoğrafı ve HTML/CSS/JavaScript temeli korundu. Yeni okuyucu tasarımı; ana sayfa, ayrı yazı sayfaları, kategori/etiket gezinmesi, Türkçe arama, sayfalama, arşiv ve hakkında sayfalarını içerir. Tema, yazı boyutu, kaydedilenler, son okunan yazı, içindekiler, bağlantı paylaşımı ve okuma ilerlemesi desteklenir. Sunucuda oluşturulan yazı HTML'i, canonical/meta/sosyal kartlar, JSON-LD, RSS ve sitemap eklendi.

Yönetim paneli Node.js 24 + Express + SQLite üzerinde çalışır. Güvenli oturum, CSRF ve yetki denetimi; Markdown ve isteğe bağlı zengin editör; taslak, önizleme, yayımlama, yayından kaldırma; başlık/açıklama/slug/kategori/etiket/yazar/tarih/kapak alanları; çoklu fotoğraf yükleme ve arşiv geliştirildi. Görseller gerçek dosya biçimi, 10 MB ve 40 MP sınırlarıyla doğrulanır, en fazla 1920 px WebP'ye dönüştürülür; asılları özel veri dizininde tutulur. Alternatif metin ve açıklama görünür biçimde desteklenir. Çakışan düzenlemeler 409 ile reddedilir.

Panelde hazır parola yoktur. İlk yönetici `npm run admin:create` ile oluşturulur. Tarayıcı dosyalarında GitHub/Firebase anahtarı veya yönetici parolası bulunmaz. Değiştirilmemiş ilk ZIP ayrı yedekte tutulur; eski istemci Firebase yapılandırması yeni uygulamaya taşınmadı.

## İçerik ve geri dönüş kanıtı

| Kontrol | Sonuç |
| --- | --- |
| Güncel kaynakta erişilebilen gerçek yazı | 9 |
| Aktarılan ve birebir doğrulanan yazı | 9 / 9 |
| Tam gövde SHA-256, başlık, tüm etiketler, yazar ve tarih alanları | Eşleşiyor |
| Ham kaynak dosyası bütünlük denetimi | 86 / 86 |
| GitHub / bilinen Firebase yorumları | 0 / 0; başarılı sorgularla doğrulandı |
| Firebase istatistik dokümanı | 12 ham kayıt yedeklendi |
| Yazı gövdesindeki görsel referansı | 0 |
| Ayrıca arşivlenen GitHub avatarı | 1 / 1; SHA-256 eşleşiyor |
| Orijinal profil fotoğrafı | ZIP'teki `pp.jpg` korundu |
| İkinci aktarım | 0 ekleme, 9 atlama; çoğaltma veya düzenlenmiş metne yazma yok |
| Gerçek yedeği ayrı dizine geri yükleme | Başarılı; yeniden 9 / 9 içerik doğrulaması |
| Eski `#post-<issue.id>` eşleştirmesi | 9 / 9 yazı HTTP kontrolleriyle doğrulandı |
| Yeni slug değişikliği | Yayımdaki yazının eski yolu 301; taslaklarda açığa çıkmıyor |

Makinece okunur ayrıntılar: `migration-report.json`, `restore-check-report.json` ve `content/source-backup/KAYNAK-VE-YEDEK-RAPORU.md`.

**Kurtarılamayan metinler:** Firebase'de `4759580384`, `4771315897`, `6257937942` kimliklerine ait istatistikler var, fakat mevcut GitHub yanıtında bu yazıların başlık ve gövdeleri yok. Bunların metni aktarılmış sayılmıyor. İstatistikleri ham yedekte korundu. Önceki bir GitHub dışa aktarımı veya kişisel metin yedeği gerekebilir. Firebase servis hesabıyla tüm proje dışa aktarımı, Auth kullanıcıları veya bilinmeyen koleksiyonlar yedeklendiği iddia edilmez.

## Çalıştırılan kontroller

- `npm run build`: başarılı. Yerel Quill/Turndown varlıkları ve JPEG sosyal görsel hazır; JavaScript kaynaklarının sözdizimi denetlendi.
- `npm test`: **19 / 19 başarılı**, sıfır hata ve sıfır atlama. 13 uygulama/güvenlik testi, 3 aktarım/yedek testi, gerçek 9 yazıyla 3 okuyucu testi.
- `npm run import` yeniden çalıştırma: 0 ekleme / 9 atlama.
- `npm run verify`: `passed: true`, 9 / 9 birebir içerik.
- `npm audit --omit=dev --audit-level=low`: **0 bilinen güvenlik açığı**. Tarama sonrasında açık veren Quill 2.0.3 yerine 2.0.2 ve güncel Sharp 0.35.5 sabitlendi; kilit dosyası teslimde.
- Gerçek yedek alma/geri yükleme ve değiştirilmiş dosyanın geri yüklemeden önce reddedilmesi doğrulandı.
- Eski Pages köprüsü yerelde üretildi; bilinen yazı, eksik kimlik ve ana sayfa hedefleri çalıştırılarak doğrulandı. Canlıya yüklenmedi.
- Tarayıcıya sunulan dosyalar HTTP durumları ve MIME türleriyle denetlendi. Gerçek kaynakla sayfalama 6 + 3, Türkçe arama, kategori/etiket, arşiv, hakkında, 404, RSS/sitemap ve bütün yazı adresleri doğrulandı.

Uygulama/güvenlik testleri giriş/çıkış, yetkisiz işlemler, yabancı Origin/CSRF, taslağın kamudan gizlenmesi, önizleme/XSS, yayımlama/yayından kaldırma, slug yönlendirmesi, aynı anda düzenleme, hatalı/büyük görsel reddi, optimizasyon, özel asıl dosya saklama, alternatif metin/açıklama, veri kalıcılığı, giriş denemesi sınırlaması ve HTTPS üretim çerezlerini kapsar.

## Çalıştırılamayan kontroller

Bu oturumun araçlarında `cua_repl.js` / masaüstü JavaScript kontrolü bulunmadı. Ortam hazır olduktan sonra araçlar yeniden arandı; `remote_desktop` enabled:true/state:unknown raporladı. Ortam kimliği: `ccarenv_b64_Y2NhcmVudl80NGJlM2NhNTVkYzA4MTkxOTIyNDQyOWFmZGExM2QwMA`. Bu nedenle **gerçek Chrome'da tıklama, Quill araç çubuğu etkileşimi, klavye/ekran okuyucu ve fiziksel mobil cihaz görünümü test edilmedi**. Başarılı HTTP/sunucu testleri bu kontrollerin yerine geçmiş sayılmaz. Duyarlı CSS, semantik HTML, focus işaretleri ve dialog davranışları kodda uygulanmıştır; canlıya geçmeden önce tarayıcıda son kontrol gerekir.

Docker image/container derlemesi, gerçek üretim sunucusu/HTTPS, sağlayıcının disk kalıcılığı ve eski alan adındaki canlı köprü henüz çalıştırılmadı. Bunlar barındırma seçimi ve canlı geçiş onayından sonra denetlenmelidir.

## Size kalan kurulum

Uygulama arşivini yeni klasöre açıp `README.md` ve `KURULUM.md` adımlarını izleyin; yönetici parolanızı kendiniz belirleyin. Günlük yazı/fotoğraf işlemleri `KULLANIM.md` içinde anlatılır. Kalıcı diskli barındırma ve HTTPS adresini seçtikten sonra maliyet/geri dönüş planını onaylayın. GitHub Pages bu sunucu uygulamasını doğrudan çalıştıramaz. Ücretsiz/ekonomik seçenekler `YAYIN-VE-GERI-DONUS.md` içinde karşılaştırılmıştır.
