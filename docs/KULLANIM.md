# Hindiba'yı kullanma rehberi

Bu rehber, site kurulup yönetici hesabınız oluşturulduktan sonraki günlük kullanım içindir. Yönetim paneli, sitenizin adresine `/admin` eklenerek açılır. Giriş bilgileri kurulum sırasında size ait olarak belirlenir; hazır bir kullanıcı adı veya ortak parola yoktur.

## Yeni yazı nasıl eklerim?

1. `/admin` adresini açıp yönetici hesabınızla giriş yapın.
2. **Yeni yazı** düğmesini seçin.
3. Başlığı ve kısa açıklamayı yazın. Kısa açıklama, yazı listesinde ve paylaşım bilgilerinde kullanılır.
4. Yazınızı metin alanına yazın veya yapıştırın. Markdown düzenleyicisi başlık, bağlantı ve görsel eklemeyi destekler. İsterseniz zengin metin düzenleme görünümüne geçebilirsiniz.
5. Kategori ve etiketleri seçin/yazın. Yazı adresini ve yazar bilgisini kontrol edin. Adres, kısa ve kolay okunur olabilir: örneğin `van-aksami`.
6. İsterseniz bir kapak fotoğrafı ekleyin ve alternatif metnini yazın.
7. **Taslağı kaydet** ile kaydedin. Taslak yazı okuyuculara, aramaya, RSS'e veya site haritasına eklenmez.
8. **Önizle** ile metni ve görselleri kontrol edin.
9. Hazır olduğunuzda **Yayımla** düğmesini seçin. Panelin başarı mesajını görün; okuyucu sayfasını açıp kontrol edin.

GitHub'da issue açmanız gerekmez. İnternet kesilirse veya kaydetme hatası görünürse başarı mesajı gelmeden yazının kaydedildiğini varsaymayın. Uzun bir yazıyı yazarken ara ara taslak kaydedin.

## Markdown ve zengin metin arasındaki fark

Markdown görünümü metnin düz yazı kaynağını gösterir. Mevcut yazılar bu görünümde açılır; özgün Markdown metni gereksiz yere dönüştürülmez. Örnek kullanım:

```markdown
## Bir ara başlık

Burada **kalın**, burada *italik* bir kelime var.

[Bağlantı metni](https://ornek.com)
```

Zengin metin görünümünde araç çubuğu ile kalın, italik, liste ve bağlantı ekleyebilirsiniz. Bu görünüme geçiş metni HTML'e, geri dönüş ise Markdown'a dönüştürür. Görünüm korunabilse de boşluklar veya bazı Markdown biçimleri değişebilir. Özgün biçimi birebir korumak istediğiniz eski yazıları Markdown görünümünde düzenleyin. Zengin görünüm değişikliğini istemiyorsanız kaydetmeden çıkın.

## Fotoğraf nasıl yüklerim?

1. Yazıyı açın. Yazı içindeki fotoğraf için **Fotoğraf ekle**, kapak için **Fotoğraf seç / yükle** düğmesini seçin. Açılan fotoğraf arşivinden dosya seçin. Telefonda galeri veya kameradan seçime cihazınız izin verir.
2. JPEG, PNG, WebP veya GIF dosyası seçin. Dosya en fazla **10 MB**, görüntü en fazla **40 milyon piksel** olabilir. Çok büyük telefon fotoğrafı reddedilirse cihazda boyutunu küçültüp yeniden deneyin.
3. **Alternatif metin** alanına fotoğrafta ne olduğunu kısaca yazın. Örneğin: “Sonbaharda Van Gölü kıyısındaki sarı yapraklar.” Bu metin ekran okuyucular ve fotoğraf yüklenemediğinde okuyan kişiler için kullanılır.
4. İsterseniz açıklama girin. Açıklama, fotoğrafın bağlamını veya kaynağını verebilir.
5. **Fotoğrafları yükle** düğmesini seçin ve başarı mesajını bekleyin.
6. Fotoğrafı **kapak** olarak seçin veya yazı içine ekleyin. Yazı içinde birden fazla fotoğraf kullanılabilir; her fotoğraf için bu adımları tekrarlayın.
7. Önizlemede fotoğrafın yeri, alternatif metni ve açıklamasını kontrol edip yazıyı kaydedin.

Birden fazla dosya seçip birlikte yükleyebilirsiniz. Bu durumda aynı alternatif metin ve açıklama tümüne uygulanır; yükledikten sonra arşivde her görseli seçip bilgilerini ayrı ayrı düzenleyin. Görseli yazıya ekledikten sonra arşivdeki açıklamayı değiştirmeniz daha önce eklenen yazı metnini otomatik güncellemez; gerekiyorsa yazıyı da düzenleyin.

Yüklenen fotoğraf sunucuda kalıcı olarak saklanır. Okuyucuya sunulan kopya, en uzun kenarı 1920 pikseli aşmayacak şekilde WebP'ye dönüştürülür. Konum gibi dosya metadata bilgileri yayımlanan kopyadan çıkarılır; özgün dosya özel veri dizininde tutulur. GIF yüklemeleri yayımlanan kopyada hareketsiz kareye dönüştürülür.

Görseli yazıya eklemek yazıyı otomatik olarak yayımlamaz. Görseli ekledikten sonra taslağı kaydetmeyi veya yazıyı güncellemeyi unutmayın.

## Var olan yazıyı nasıl değiştiririm?

Panelde yazıyı bulun ve açın. Başlık, metin, açıklama, kategori, etiket, kapak veya adresi düzenleyip kaydedin. Yayımlanmış bir yazıyı kaydetmeden önce durumunu kontrol edin. Eski bir yazının adresini değiştirdiğinizde eski yeni yazı yolu için kalıcı yönlendirme kaydedilir; yazıyı silip başka bir kayıt oluşturmak yerine mevcut kaydı düzenleyin.

Aynı yazı başka bir sekmede değiştirilmişse çakışma uyarısı gelebilir. Kendi metninizi geçici bir dosyaya kopyalayın, güncel yazıyı yeniden açın ve değişikliklerinizi birleştirin. Uyarıyı tekrar tekrar kaydederek aşmaya çalışmayın.

## Yazıyı yayından nasıl kaldırırım?

Yazıyı panelde açın ve **Yayından kaldır** işlemini seçin. İçerik taslak olarak saklanır; okuyucu listelerinden, RSS'ten ve site haritasından çıkar. Yeniden yayımlamak için aynı yazıyı açıp **Yayımla** düğmesini kullanın. Bu işlem eski GitHub Issues kaydını silmez veya değiştirmez.

## Güvenli günlük kullanım

- İşiniz bitince panelden çıkış yapın; ortak bir cihazda oturumu açık bırakmayın.
- Yönetici parolanızı paylaşmayın; parola değişikliği veya unutulması için kurulumu yapan kişiden yönetici komutunu kullanmasını isteyin.
- Fotoğraflar ve yazılar için düzenli sunucu dışı yedek alınmasını sağlayın. Bilgisayardaki kaynak kod kopyası, yeni yüklenen fotoğrafların yedeği değildir.
- Panel hata gösterirse taslak metninizi koruyun ve hata mesajını kurulumu yapan kişiye iletin; parola veya oturum bilgilerinizi göndermeyin.
