# 🌿 Hindiba | Eşref Akbaş - Hatıra Defteri

> "Belki de şimdiye kadar ardından söylenebilecek en zarif benzetme 'Hindiba' idi…"

Kişisel edebiyat, şiir ve günlük yazıları blogu. GitHub Issues üzerinden içerik yönetimi ve Firebase entegrasyonlu yorum sistemi ile modern bir blog deneyimi sunar.

## ✨ Özellikler

### 📝 İçerik Yönetimi
- **GitHub Issues Entegrasyonu:** Blog yazıları doğrudan GitHub Issues üzerinden yönetilir
- **Otomatik İçerik Çekme:** GitHub API ile yazılar otomatik olarak çekilir ve listelenir
- **Markdown Desteği:** Yazılar Markdown formatında yazılır ve otomatik HTML'e dönüştürülür
- **Kategori Sistemi:** GitHub Issues etiketleri (labels) ile kategorilendirme (Edebiyat, Şiir, Günlük, Bir Cümle)
- **İçindekiler Tablosu:** Uzun yazılar için otomatik içindekiler oluşturma
- **İlgili Yazılar:** Aynı kategorideki benzer yazıları gösterme

### 🎨 Tasarım & Kullanıcı Deneyimi
- **🌙 Karanlık/Aydınlık Tema:** Otomatik tema değiştirme ve localStorage'da tercih saklama
- **📱 Tam Responsive Tasarım:** Mobil, tablet ve masaüstü cihazlara tam uyum
- **✨ Modern Animasyonlar:** CSS geçişleri ve animasyonlarla akıcı kullanıcı deneyimi
- **📊 Okuma İlerleme Çubuğu:** Sayfa başında okuma ilerlemesini gösteren çubuk
- **🔍 Gerçek Zamanlı Arama:** Başlık ve içerik üzerinde anlık arama
- **📖 Okuma Süresi Hesaplama:** Her yazı için tahmini okuma süresi
- **🔤 Yazı Boyutu Ayarı:** Kullanıcı tercihine göre yazı boyutunu değiştirme (+, -, reset)
- **❤️ Yazı Kaydetme:** Beğenilen yazıları localStorage'da saklama
- **📑 Kategori Filtreleme:** Kategorilere göre yazıları filtreleme
- **🔄 Sonsuz Kaydırma Yerine Sayfalama:** Tüm yazılar tek sayfada, filtreleme ile erişim

### 💬 Yorum Sistemi (Firebase)
- **💭 Gerçek Zamanlı Yorumlar:** Firebase Firestore ile anlık yorum güncellemeleri
- **❤️ Beğeni Sistemi:** Yorumları beğenme ve beğeni geri alma
- **👤 Anonim Yorum:** Kullanıcı adı ile veya anonim yorum yapabilme
- **🚦 Spam Koruması:** 15 saniyelik yorum gönderme sınırı (cooldown)
- **👁️ Görüntülenme Sayacı:** Her yazı için okunma sayısı takibi
- **🔒 IP Bazlı Beğeni Limiti:** Aynı kullanıcının birden fazla beğenisini engelleme

### 🔗 Sosyal Entegrasyonlar
- **📸 Instagram Profili:** `@esrefakbs`
- **🐦 X (Twitter) Profili:** `@esrefakbs`
- **🎵 Spotify Playlist:** Kişisel playlist bağlantısı
- **🔗 Paylaşım Butonları:** Twitter'da paylaşma ve link kopyalama

### 🛡️ Güvenlik & Performans
- **XSS Koruması:** Tüm kullanıcı girdileri escape edilir
- **URL Sanitization:** Güvenli URL protokol kontrolü
- **Erişilebilirlik (A11y):** ARIA etiketleri, klavye navigasyonu, ekran okuyucu desteği
- **Hata Yönetimi:** API hatalarında yedek içerik gösterme
- **Performans Odaklı:** Minimum harici kütüphane kullanımı
- **Hareket Azaltma Desteği:** `prefers-reduced-motion` medya sorgusu

## 🚀 Teknolojiler

| Teknoloji | Kullanım Amacı |
|-----------|---------------|
| **HTML5** | Sayfa yapısı |
| **CSS3** | Stil, animasyonlar ve responsive tasarım |
| **JavaScript (ES6+)** | Tüm dinamik işlevler |
| **GitHub REST API** | Blog yazılarını çekme |
| **Firebase Firestore** | Yorum ve beğeni sistemi |
| **Firebase Auth** | Anonim kullanıcı girişi |
| **Font Awesome 6** | İkonlar |
| **LocalStorage API** | Kullanıcı tercihlerini saklama |

## 📂 Dosya Yapısı
hindiba-blog/
├── index.html # Ana blog sayfası (HTML + CSS + JS)
├── pp.jpg # Profil fotoğrafı
├── README.md # Proje dokümantasyonu
└── (GitHub Issues) # Blog içerikleri
