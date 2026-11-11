# Render üzerinde önerilen kurulum

**11 Kasım 2026** tarihinde Render'ın resmî fiyatları ve kurulum belgeleri kontrol edilerek hazırlanmıştır. Bu belge ve `render.yaml` yalnızca kuruluma hazırlıktır: Render hesabı açılmadı, hizmet oluşturulmadı, ödeme başlatılmadı, mevcut GitHub Pages yayını veya DNS değiştirilmedi. GitHub'a kod gönderme izni, ücretli barındırma oluşturma izni yerine geçmez.

## Öneri ve maliyet

Tek yazarlı Hindiba blogu için ücretsiz Hobby workspace içinde bir ücretli Node.js web servisi ve 1 GB kalıcı disk önerilir. Yeni sitenin ilk adresi Render'ın verdiği HTTPS `onrender.com` adresi olur; özel alan adı satın almak başlangıçta gerekli değildir.

| Kalem | Kontrol edilen fiyat / özellik |
| --- | --- |
| Hobby workspace | Aylık 0 ABD doları; uygulama ve kullanım ücretleri ayrıca hesaplanır. |
| Web servisi, `0.5c-512mb` | Aylık 7 ABD doları; 0,5 CPU, 512 MB RAM. |
| 1 GB kalıcı disk | GB başına aylık 0,25 ABD doları; 1 GB için 0,25 ABD doları. |
| Başlangıç toplamı | **Aylık 7,25 ABD doları**, vergiler ve kota aşımı hariç. |

Kaynak: [Render fiyatları](https://render.com/pricing). Fiyat sayfası Hobby için aylık 5 GB bant genişliği ve 500 standart build dakikası gösterir; aşım ücretleri ayrıca uygulanabilir. Disk büyütme, ek hizmetler, özel alan adı satın alma ve sunucu dışı yedek depolaması bu taban hesaba dahil değildir. Türk lirası karşılığı bankanın kuru ve vergilere göre değişir. Son tutar, hizmet oluşturulmadan önce Render'ın onay ekranında yeniden kontrol edilmelidir.

Güncel görünür plan kimliği `0.5c-512mb` kullanılmıştır. Eski `starter` adı da [resmî Blueprint JSON şemasında](https://render.com/schema/render.yaml.json) kabul edilir; bu dosya güncel plan adını kullanır.

## Hazırlanan yapılandırma

Depo: `esakbas/esakbas.github.io`; geliştirme dalı: `codex/hindiba-cms-20261111`. Kurulum öncesinde dalın son kontrollerinin başarılı olduğu doğrulanmalıdır. Bu öneri ana dalı birleştirmez veya mevcut Pages yayın kaynağını değiştirmez.

`render.yaml` aşağıdaki davranışı tanımlar:

- `runtime: node`, `plan: 0.5c-512mb`, `region: frankfurt`; tek uygulama örneği.
- Disk adı `hindiba-data`, bağlama yolu `/var/data`, kapasite `sizeGB: 1`.
- `DATA_DIR=/var/data/hindiba`; SQLite, fotoğraflar ve özel özgün yüklemeler bu kalıcı dizindedir.
- `NODE_ENV=production`, `TRUST_PROXY=true`; Render'ın HTTPS ters vekili arkasında çalışma.
- `.node-version` içindeki `24`, Node.js 24 ana sürümünü seçer. Dashboard'da farklı bir `NODE_VERSION` değeri varsa bu dosyadan daha yüksek öncelikle uygulanır; başka bir ana sürüm seçilmemelidir.
- Derleme: `npm ci --omit=dev && npm run build`.
- Başlatma: `npm run import && SITE_URL="${SITE_URL:-$RENDER_EXTERNAL_URL}" npm start`.
- Sağlık kontrolü: `/`; otomatik commit yayını: `autoDeployTrigger: 'off'`.

`autoDeployTrigger: 'off'`, sonraki Git commitlerinde otomatik dağıtımı kapatır. **İlk Blueprint oluşturulmasını veya ilk ücretli dağıtımı engellemez.** Hizmet oluşturma adımı onaydan sonra yapılmalıdır.

Kalıcı disk, Render'ın build ve pre-deploy işlemlerine bağlı değildir; yalnız çalışan hizmette bulunur. Bu nedenle içerik aktarımı build komutunda değil, başlangıç komutunda çalışır. Aktarım tekrarında mevcut yazılar çoğaltılmaz ve panelden düzenlenen metinler ezilmez.

`RENDER_EXTERNAL_URL`, Render'ın web servisine verdiği tam HTTPS `onrender.com` adresidir. Başlatma komutundaki shell ifadesi, `SITE_URL` ayrıca belirlenmemişse bu adresi kullanır. Daha sonra özel alan adına geçilirse `SITE_URL` gerçek HTTPS alan adı olarak ayarlanıp yeniden dağıtılır; `RENDER_EXTERNAL_URL` özel alan adına dönüşmüş sayılmaz. Uygulama Render'ın sağladığı `PORT` değerini ve `0.0.0.0` bağlama adresini kullanır.

Resmî dayanaklar: [Blueprint alanları](https://render.com/docs/blueprint-spec), [Node.js sürümü](https://render.com/docs/node-version), [varsayılan ortam değişkenleri](https://render.com/docs/environment-variables), [web servisi portu ve HTTPS](https://render.com/docs/web-services), [kalıcı disk sınırları](https://render.com/docs/disks).

Hazırlanan gerçek `render.yaml`, Render'ın resmî JSON şemasına karşı yerelde doğrulanmış ve hata bulunmamıştır. Bu kontrol Render hesabında hizmet oluşturmaz; gerçek platform kurulumu yerine geçmez.

## Onaydan sonra uygulanacak adımlar

1. Sağlayıcı, aylık 7,25 ABD doları taban maliyet, olası ek ücretler ve aşağıdaki geri dönüş yolu kullanıcı tarafından onaylanır. Ardından kullanıcının Render hesabı ve ilgili GitHub deposuna erişimi gerekir. Hesap ve ödeme bilgileri sohbette paylaşılmaz.
2. Render'da bu depo ve belirtilen geliştirme dalından Blueprint kurulum ekranı açılır. Hizmetin ücretli planı, Frankfurt bölgesi ve 1 GB kalıcı diski kontrol edilir. Son maliyet kontrolünden sonra oluşturma işlemi tamamlanır.
3. Build ve ilk başlatma günlüklerinde başarılı aktarım görülür. Render'ın verdiği HTTPS kök adresinde dokuz yazı ve birkaç eski yazı bağlantısı kontrol edilir.
4. Render Dashboard'da çalışan hizmetin **Shell** ekranında `npm run verify` çalıştırılır. İlk yönetici için `npm run admin:create` çalıştırılıp kullanıcı adı ve en az 12 karakterli parola etkileşimli girilir. Parola sohbete, Git'e veya komut argümanına yazılmaz; varsayılan parola yoktur.
5. Yeni sitenin `/admin` adresinden giriş yapılır. Taslak oluşturma, fotoğraf yükleme, önizleme, yayımlama ve yayından kaldırma denenir. Hizmet yeniden başlatılarak yazı ve fotoğrafın kalıcı diskte kaldığı doğrulanır.
6. Sunucu dışı yedek alınır ve geri yükleme denemesi yapılır. Bu aşamadan sonra ayrı canlı geçiş onayıyla eski Pages köprüsü veya alan adı değişikliği ele alınır. Mevcut Pages sitesi bu sırada çalışmaya devam edebilir.

## Yedekleme ve geri dönüş

Render diski yalnız bir hizmet örneğine bağlıdır; bu uygulama aynı diski paylaşan birden fazla sunucu olarak ölçeklenmez. Diskli hizmet yeniden dağıtılırken kısa kesinti olabilir. Render'ın otomatik disk snapshot'ı, SQLite'ın kendi tutarlı yedeği yerine kullanılmamalıdır.

Çalışan hizmetin Shell ekranında, yazı/fotoğraf kaydetmeye kısa ara verilerek örneğin şu komut kullanılabilir:

```sh
npm run backup -- --out /var/data/backups/backup-20261111
```

Bu hedef `DATA_DIR` dışında, fakat hâlâ aynı Render diskindedir. Dosyaları [Render'ın dosya aktarımı yöntemleriyle](https://render.com/docs/disks#transferring-files) bilgisayara veya erişim kontrollü bağımsız bir yedek deposuna çıkarın. Veritabanı yönetici parola özetleri içerir; yedeği herkese açık Git deposuna veya uygulamanın `public/` dizinine koymayın. Ayrıntılı tutarlı yedek, checksum kontrolü ve yeni bir dizine geri yükleme adımları [yayın ve geri dönüş rehberindedir](YAYIN-VE-GERI-DONUS.md).

İlk deneme başarısız olursa mevcut GitHub Pages ve DNS ayarları değişmediği için eski site çalışmayı sürdürür. Yeni panelde eklenen yazı/fotoğrafların sunucu dışı yedeği alınmadan yeni hizmeti veya diski silmeyin. Hizmeti durdurma/askıya alma veya silme işlemi gelecek compute kullanımını etkiler; disk tutulduğu sürece disk bedeli devam edebilir. Ücretleri sonlandırmak için hesap faturalama ekranında hizmet ve disk durumları ayrıca kontrol edilir; daha önce oluşmuş kullanım ücreti geri alınmış sayılmaz. Eski Pages köprüsü ayrıca yayımlanmışsa önceki Pages sürümü geri yüklenerek eski bağlantı davranışı geri alınabilir.

Bu belge, resmî doküman ve fiyat kontrolüne dayanır. Gerçek Render hesabında build, ilk ücretli hizmet kurulumu, bellek/disk kapasitesi, ödeme ekranı ve üretim trafiği henüz denenmiş değildir.
