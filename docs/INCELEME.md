# Mevcut sistemin incelemesi

İnceleme ve dış kaynak yedeği: **11 Kasım 2026, 02.26 (Türkiye saati)**. Bu çalışma ayrı bir geliştirme kopyasında yapılmıştır. Canlı GitHub Pages sitesi, GitHub Issues kayıtları ve Firebase verileri değiştirilmemiştir.

## Nereden başladık?

Yüklenen arşivde beş dosya vardı: `index.html`, iki CSS dosyası, `pp.jpg` ve `README.md`. Uygulama derleme gerektirmeyen HTML, CSS ve JavaScript ile çalışıyordu. README, `main` dalının kökünden GitHub Pages yayını tarif ediyordu. Gerçek hesap ayarları ve ödeme bilgilerine erişim yoktur; bu barındırma bilgisi depo belgelerinden ve koddan saptanmıştır.

| Veri / özellik | Önceki kaynak |
| --- | --- |
| Yazı başlığı, Markdown metni, tarih, etiket, yazar | `esakbas/esakbas.github.io` deposunun GitHub Issues REST API yanıtı |
| Yazı listesi | `state=all`, etiketli, pull request olmayan issue kayıtları |
| Yazı adresi | `https://esakbas.github.io/#post-<issue.id>`; buradaki sayı issue numarası değildir |
| Yorumlar, yorum beğenileri, görüntülenme sayıları | `blog-yorum-85c27` Firebase Firestore projesindeki `posts/<issue.id>` ve `comments` alt koleksiyonu |
| Okuyucu tercihleri | Tarayıcıdaki localStorage: tema, kaydedilen yazılar, yazı boyutu ve son okunan yazı |
| Profil görseli | Depodaki `pp.jpg` |

Kodda ayrıca bağlantı kesilince gerçek yazı gibi gösterilen iki örnek kayıt bulunuyordu. Bunlar özgün yazı sayılmamış ve taşınmamıştır.

## İçerik envanteri

Yedek, yalnızca ZIP dosyasıyla sınırlı değildir. GitHub ve Firestore yanıtları, istek sonuçları ve dosya SHA-256 özetleri de saklanmıştır.

| Denetim | Sonuç |
| --- | ---: |
| GitHub API toplam kayıt | 10 |
| Etiketli gerçek blog yazısı | 9 |
| Yazı olmayan pull request | 1 |
| GitHub issue yorumu | 0 |
| Okunabilen Firestore istatistik belgesi | 12 |
| Okunabilen Firestore yorumu | 0 |
| Yazı gövdelerinde görsel bağlantısı | 0 |
| Ayrıca yedeklenen GitHub yazar avatarı | 1 |

Firestore listeleme ve 12 belgenin yorum alt koleksiyonları başarıyla okunmuştur. Bu nedenle yorum sayısının sıfır olması erişim hatası olarak yorumlanmamıştır. Yedek, alındığı andaki durumu gösterir; daha sonra eklenen kayıtlar bu kopyaya kendiliğinden eklenmez.

### Tam metnine ulaşılamayan kayıtlar

Firestore'da `4759580384`, `4771315897` ve `6257937942` kimlikli üç ek istatistik belgesi vardır. Bu kimlikler mevcut GitHub Issues yanıtında bulunmadığı için yazı başlıkları ve tam metinleri bu kaynaklardan kurtarılamamıştır. İstatistik belgeleri korunmuştur; bu üç kayıt yayımlanmış yazı olarak gösterilmez ve dokuz yazılık aktarım sayısına eklenmez. Eski bir GitHub dışa aktarımı veya kişisel yedek bulunursa ayrıca incelenmelidir.

## Seçilen çözüm

Hindiba'nın adı, Türkçe edebiyat/şiir/günlük kimliği, profil görseli, özgün yazıları ve sade web teknolojileri korunmuştur. Arama, kategori/etiket gezinmesi, arşiv ve okuma deneyimi bu temel üzerinde geliştirilmiştir. Sırf başka bir ön yüz teknolojisine geçmek için React veya benzeri bir uygulama çatısı eklenmemiştir.

Yönetim ve kalıcı depolama için Node.js 24, Express ve SQLite kullanılır. Yazılar SQLite'ta, fotoğraflar kalıcı veri dizininde tutulur. Panelin Markdown modu özgün metni korur; isteğe bağlı zengin metin düzenleme Quill ve Turndown ile sağlanır. Yeni yazı yayımlamak için GitHub Issues veya GitHub API bağlantısı gerekmez.

Bu çözüm, tek yazarlı bir blog için ayrı bir veritabanı sunucusunu ve ücretli CMS aboneliğini zorunlu tutmaz. SQLite dosyası ve görsel klasörleri birlikte yedeklenebilir. Sunucu yönetiminin de bir bakım işi olduğu unutulmamalıdır: Node.js ve paket güncellemeleri, HTTPS ve düzenli disk dışı yedekleme barındırma kurulumu sırasında ele alınır.

### GitHub Pages sınırı

GitHub Pages statik dosya sunar; Node.js çalıştırmaz, sunucu tarafı güvenli oturum oluşturmaz ve yüklenen fotoğrafları kalıcı diske kaydetmez. Bu nedenle yeni yönetim paneli yalnızca Pages'e dosya kopyalayarak yayımlanamaz. Seçilen uygulama için kalıcı diskli bir Node.js sunucusu veya buna uygun barındırma gerekir.

Yazılım lisans bedeli yoktur. Bu çalışma ücretli hesap açmamış veya canlı yayın başlatmamıştır. Kullanıcının mevcut Node.js barındırması yoktur; ücretsiz ve ekonomik seçenekler `YAYIN-VE-GERI-DONUS.md` belgesinde karşılaştırılır. Barındırma, alan adı ve yedek depolama maliyeti sağlayıcıya ve seçilen plana bağlıdır; sağlayıcı seçilmeden kesin bir fiyat taahhüt edilmez. Canlıya geçmeden önce hizmet, toplam maliyet, alan adı ve geri dönüş adımları açıkça onaylanmalıdır.

GitHub Pages'te kalmak için Decap CMS ve GitHub OAuth aracısı gibi bir seçenek de mümkündür. Bu çözümde yazılar dosyalara, yüklemeler Git deposuna yazılır; OAuth yapılandırması ve yayımlama/derleme akışı gerekir. Issues bağımlılığını kaldırsa da günlük yönetimi Git işlemleri ve ek kimlik servisine bağlar. Bu çalışma, doğrudan panelden kaydetme/yayımlama ve tek veri diziniyle yedekleme hedefi için Node.js/SQLite yaklaşımını seçer. Pages'i korumak en yüksek öncelik olursa bu alternatif ayrıca değerlendirilebilir.

## Adreslerin korunması

Eski `#post-<issue.id>` bağlantıları için kimlik eşleştirmesi korunur. Tarayıcı URL parçasını sunucuya göndermediğinden bu adreslere sunucu tarafında HTTP 301 uygulanamaz; tarayıcıdaki uyumluluk kodu ilgili yeni yazıyı açar. Bunun çalışması için eski alan adının yeni ana sayfaya ulaşması gerekir. GitHub Pages alanı başka bir sunucuya taşınamadığından alan adı değişikliği canlı geçişte ayrıca ele alınır.

Yeni yazı yolları `/yazi/<adres>` biçimindedir. Panelden yazının adresi değiştirildiğinde önceki yol için HTTP 301 yönlendirmesi tutulur. Geri yükleme sırasında veritabanındaki bu eşleştirmeler de geri gelir.

## Yedek ve doğrulama sınırı

Ham kaynak verileri ve ilk kod arşivi geri yükleme için saklanır. Bu, bilinen blog koleksiyonlarının erişilebilir REST yedeğidir; Firebase'in servis hesabıyla alınmış tüm proje dışa aktarımı değildir. Firebase güvenlik kuralları, Auth kullanıcıları, bilinmeyen koleksiyonlar ve API'de bulunmayan geçmiş yazı gövdeleri yedeklenmiş gibi gösterilmez. Ham dosyaların checksum listesi 86 dosyayı kapsar; kapsamın ayrıntıları kaynak yedeğindeki `KAYNAK-VE-YEDEK-RAPORU.md` dosyasındadır.

Aktarım aynı kaynak kimliğini ikinci kez eklemez; panelde sonradan düzenlenen yazıyı yeniden aktarım sırasında ezmez. Başlık, tam Markdown metni, kaynak tarihleri, etiketler, yazar ve kaynak metadata alanları aktarım doğrulamasıyla karşılaştırılır.

Yeni panelin veritabanı ve yüklemeleri, eski GitHub/Firebase kayıtlarından bağımsızdır. Kaynak kayıtlar silinmemiştir. Yönetim akışları ve ilgili testlerin son sonuçları teslimdeki doğrulama raporunda açıklanır; bu inceleme belgesi tek başına canlıya geçiş doğrulaması değildir.
