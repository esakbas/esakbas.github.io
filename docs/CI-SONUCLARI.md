# GitHub doğrulama sonuçları

11 Kasım 2026 · Türkiye saati. Kontroller üretimden ayrı GitHub Actions Ubuntu/Node.js 24 ortamında çalıştırıldı.

- Kod commit'i: `c3b81ed64e69d99ded5604329b3f5beb01e9524a`.
- [Tam başarılı Actions çalışması](https://github.com/esakbas/esakbas.github.io/actions/runs/42968442697).
- Derleme: başarılı.
- Uygulama/aktarım/okuyucu: **19/19**.
- Masaüstü/mobil Chromium: **6/6**; 15,3 saniyede tamamlandı.
- Kaynak dosyaları: **86/86**; yazı metni ve metadata: **9/9**.
- Tekrarlı aktarım: **0 ekleme, 9 atlama**.
- `npm audit --audit-level=low`: **0 bilinen açık**.

Tarayıcı testleri giriş, taslak, önizleme, birden fazla fotoğraf yükleme/ekleme, kapak, alternatif metin ve açıklama, yayımlama/yayından kaldırma ve okuyucudan görünürlüğü kapsar. Quill kalın metin/görsel açıklaması ile Markdown dönüşümü ve yeniden açılan kaydın korunması doğrulandı. 390 px Chromium emülasyonunda yatay taşma kontrolü yapıldı.

## Gerçek test ekran görüntüleri

Bu görseller tasarım maketi değildir; başarılı Chromium test çalışmasından alınmıştır. Panelde görünen `editor` hesabı yalnızca geçici test hesabıdır, üretim hesabı değildir.

- [Ana sayfa — masaüstü](onizleme/ana-sayfa-masaustu.png)
- [Yönetim paneli](onizleme/yonetim-paneli.png)
- [Ana sayfa — mobil](onizleme/ana-sayfa-mobil.png)

Actions indirme çıktısında ayrıca yazı düzenleme, Quill, fotoğraflı yazı ve koyu tema arşiv ekran görüntüleri vardır. GitHub çıktıları 14 gün saklanır; yukarıdaki üç görsel bu dalda kalıcıdır.

`main` başlangıç commit'i `47313f9acc0d746dad3af8256f9304a6eba2c2ab` olarak korunur. Kök `index.html`, iki CSS ve `pp.jpg` dosyalarının byte/commit blob değerleri değişmedi. İş akışında dağıtım adımı yoktur. Docker üretim kurulumu, fiziksel cihazlar ve gerçek hosting henüz doğrulanmadı.
