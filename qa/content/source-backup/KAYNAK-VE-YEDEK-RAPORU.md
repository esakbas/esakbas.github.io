# Kaynak incelemesi ve dış içerik yedeği

Yedek anı (UTC): 2026-11-10T23:26:57.487374+00:00. Türkiye saatiyle 11 Kasım 2026 02:26.

## Mevcut sistem

Yüklenen kaynak, derleme adımı olmayan HTML/CSS/JavaScript tabanlı bir GitHub Pages blogudur. Depo: `esakbas/esakbas.github.io`; mevcut ana adres: `https://esakbas.github.io/`. Sayfa başlığı Hindiba, yazar Eşref Akbaş, dil Türkçe. Profil görseli `pp.jpg` dosyası ZIP içindedir. Yazı gövdeleri kaynak ZIP içinde bulunmaz; çalışma anında GitHub REST Issues API'den alınır. Markdown tam metinleri `body` alanındadır. Eski görüntüleme filtresi, PR olmayan ve en az bir etiketi bulunan tüm açık/kapalı issue kayıtlarını içerir. Eski yazı adresi `/#post-<GitHub issue.id>` biçimindedir; issue sıra numarası kullanılmaz.

Kategori/etiketler GitHub labels alanından gelir. Yazar için ham GitHub user nesnesi tutulmuştur. Ana kimlik, şiir/günlük/edebiyat/bir-cümle kategorileri, tarih, kaydetme/okuma ayarları ve ilgili yazılar davranışları korunabilir. Mevcut orijinal kodda ağ hatasında örnek yazı gösterme vardır; bu yedek gerçek API verilerini içerir, örnek metinleri içerik olarak saymaz.

Yorumlar ve görüntüleme sayıları ayrı `blog-yorum-85c27` Firebase Firestore projesindeki `posts/<issue.id>` ve `posts/<issue.id>/comments` adreslerinden okunur. GitHub Pages sunucuda oturum, veritabanı veya dosya yükleme çalıştıramaz. Güvenli bir yönetim paneli için kalıcı veri diski ve sunucu çalışma ortamı ya da eşdeğer harici CMS hizmeti gerekir.

## Yedeklenen veriler

- Orijinal ZIP: üst klasördeki `original.zip`; SHA256 üst klasördeki `manifest.json` içindedir.
- GitHub tüm açık/kapalı Issues sayfaları: `issues-page-*.json`; birleştirilmiş ham nesneler `github-issues.json`.
- 10 API kaydı: 9 gerçek etiketli blog yazısı ve 1 PR. PR, yedekte tutulur; blog yazısı olarak aktarılmaz.
- Başlık, body, created_at, updated_at, labels, user, state, issue kimliği, URL, reaksiyon özeti gibi tüm API alanları ham JSON'da korunur.
- `github-comments.json`: her issue kimliği için yorum listesi. Tüm listeler boş; API yanıtlarında toplam **0 GitHub yorumu** vardır.
- `github-reactions.json`: her issue kimliği için ham reaksiyon listesi.
- `github-labels.json`, `github-repository.json`: etiket ve depo metadata yedeği.
- `firestore-posts.json`: herkese açık REST okumasıyla erişilen **12** ham istatistik dokümanı. Orijinal createTime/updateTime ve integerValue gibi Firestore türleri korunur.
- `firestore-comments.json`: bilinen 12 posts kimliğinin comments alt koleksiyonları; başarılı sayfalı API yanıtlarında toplam **0 yorum** bulunmuştur.
- `images.json` ve `images/`: 1 yazar avatarı kalıcı dosya olarak indirildi. Dokuz yazının Markdown/HTML gövdesinde **0 görsel referansı** vardır. Yerel pp.jpg orijinal ZIP'te bulunur.
- 36 GET isteğinin HTTP durumları `requests.json` ve yanıt başlıkları dosyalarında tutulur. Hiçbir uzak içerik değiştirilmedi/silinmedi; anonim Firebase kullanıcı hesabı bile oluşturulmadı.

## Yazı envanteri

| Issue no | Kalıcı issue.id | Başlık | Oluşturulma UTC | UTF-8 body bayt |
|---|---|---|---|---|
| 18 | 6210660748 | Yine bir Van akşamı, yine sonbahar… | 2026-11-04T20:19:31Z | 1683 |
| 17 | 5667381915 | Mazi | 2026-10-01T18:47:53Z | 1108 |
| 16 | 5315720552 | Özlenene Mektup | 2026-09-01T19:04:57Z | 4206 |
| 15 | 4864006971 | Huysuzluk ve Ben | 2026-07-11T20:15:55Z | 424 |
| 13 | 4715157838 | Sabah'ın Yükü | 2026-06-22T09:14:40Z | 1373 |
| 11 | 4682613944 | Belki de onu son defa görmemdi… ya da sonumdu. | 2026-06-17T11:03:06Z | 885 |
| 8 | 4660551847 | Bir Haziran Mevzusu... | 2026-06-14T20:45:31Z | 583 |
| 7 | 4660386701 | ... | 2026-06-14T19:47:58Z | 172 |
| 5 | 4628470338 | Gülün Ahı | 2026-06-10T05:55:51Z | 72 |

Her metnin SHA256 özeti ve tam metadata `migration-manifest.json` içindedir. Dosya bütünlük envanteri `checksums.json` içindedir.

## Açık içerik eksikleri ve sınırlar

Firestore'da `4759580384`, `4771315897`, `6257937942` kimlikleri için görüntüleme istatistiği vardır; bu kimliklerin eşleşen tam metinleri, başlıkları ve tarihleri güncel GitHub Issues yanıtında bulunmamaktadır. Sebebi API yanıtından belirlenemez. İstatistik kayıtları aynen yedeklendi; bu üç kayıt için blog yazısı oluşturulmadı ve tam metin aktarılmış sayılmadı. Kullanıcıda eski dışa aktarım/yedek varsa bu kimliklerle güvenle eşleştirilebilir.

Bu, bilinen blog içerik kaynaklarının erişilebilir REST yedeğidir; Firebase projesinin servis hesabıyla alınmış tüm proje idari exportu değildir. Bilinen 12 ID'nin yorum sorguları başarılıdır ve boştur. Firestore güvenlik kuralları, Firebase Auth hesapları, erişilemeyen geçmiş/silinmiş içerikler, bilinmeyen koleksiyonlar ve GitHub'ın API'de sunmadığı geçmiş düzenleme sürümleri yedeklenmiş gibi gösterilmez.

## Doğrulama ve geri yükleme

`checksums.json` içindeki her dosyanın SHA256 değeri yeniden hesaplandı: uyuşmazlık **0**. GitHub kaynak metinleri değiştirilmeden JSON'da saklanır; gövdeler üzerine yeniden biçimlendirme uygulanmaz. Yazı sayısı karşılaştırmasında PR hariç doğru taban sayı **9** olmalıdır. İkinci aktarımın anahtarı depo+issue.id olmalı, body hash değişmemişse veri yeniden oluşturulmamalıdır.

Orijinal sunuma dönüşte orijinal ZIP dosyaları kullanılabilir; hiçbir kaynak issue veya Firebase dokümanı değiştirilmediği için eski harici kaynaklar yerinde kalır. Uzak GitHub/Firebase geri yüklemesi otomatik çalıştırılmamalıdır; ham yedekler veri kaybı durumunda kimlik, tarih, gövde ve yorumların karşılaştırılıp kontrollü aktarılmasını sağlar. Yeni uygulama için üretilen kalıcı veri ve yüklemeler ayrıca yedeklenmelidir.
