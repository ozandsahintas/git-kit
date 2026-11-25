# git kit prs

> **Kip: [salt okunur]** · Grup: Durum / rapor · Kaynak: [`commands/prs.js`](../../commands/prs.js)

PR'larını durumuna (open, draft, merged, closed) ve **dokunduğu dosyalara** göre listeler. Bir ya da birden fazla repoya bakabilir.

## Ne işe yarar

Şu tür soruları tek komutla cevaplar:

- "Açtığım PR'lardan hangileri hâlâ açık, hangileri draft, hangileri merge oldu?"
- "Hangi PR'larım `src/cart/` altına dokunuyor?"
- "Bütün repolarımda, son bir ayda, ödeme modülüne dokunan PR'larım hangileri?"

Hiçbir şeyi değiştirmez.

### Neden `gh pr list` / `gh pr view` yetmiyor

`gh` ile aynı soruyu sormak bir shell döngüsü gerektirir. Bu yöntemin üç sorunu var:

1. **Dosya listesi 100'de kesilir.** `gh pr view --json files` 100'den fazla dosyası olan PR'larda listeyi **hiçbir uyarı vermeden** 100'de keser. 104 dosyalık bir PR'da aradığın dosya 101. sıradaysa PR "dokunmuyor" görünür ve sonuç sessizce eksik olur. `prs`, dosyaları `gh api --paginate` ile sayfa sayfa alır; liste eksiksizdir. GitHub API'nin kendi sınırı PR başına 3000 dosyadır.
2. **Kapatılmış PR'ları elle ayıklamak gerekir.** `prs`, kapatılmış (merge edilmeden kapatılmış) PR'ları varsayılan olarak göstermez.
3. **Çıktı kirlenir.** `gh` bazı çağrılarda ekrana ipucu satırları basar. `prs` bunları yakalar, yalnız sonucu gösterir.

## Ne zaman

- Bir modülde ne kadar açık iş olduğunu görmek istediğinde.
- Bir dosyada değişiklik yapmadan önce, ona dokunan açık PR'ların (olası çakışmalar) listesini görmek istediğinde.
- Sprint ya da haftalık özet hazırlarken: `--since` ile.
- Birden fazla repoda aynı konuya dokunan PR'ları toplamak gerektiğinde: `--repos`.

## Kullanım

```sh
git kit prs [seçenekler]
```

Repo verilmezse içinde bulunduğun repoya bakar; origin'i GitHub'da olmalı. Herhangi bir yerden `--repo` ya da `--repos` ile de çalıştırılabilir.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** `prs` [salt okunur] kiptedir; hiçbir şeyi değiştirmediği için **`--apply` ve `--yes` almaz**. Git'e değil GitHub'a baktığı için fetch yapmaz, `--no-fetch` da almaz.
> Bu komutta `gh` **zorunludur**: kurulu ve `gh auth login` ile oturum açık olmalı. (`overview`/`repos-status`'ta `gh` yalnızca PR kolonu için gerekir ve yoksa kolon gösterilmez.)
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Varsayılan | Açıklama |
|---|---|---|
| `--repo <sahip/ad>[,...]` | içinde bulunulan repo | Bakılacak GitHub repoları, virgülle ayrılmış. |
| `--repos <kök>` | | Kökün **doğrudan** alt klasörlerindeki, origin'i GitHub'da olan tüm repolar. Linked worktree klasörleri ayrı repo sayılmaz. `--repo` ile birlikte verilebilir. |
| `--author <login>` | `@me` | PR'ı açan kişi. Herkesin PR'ları için `all`. |
| `--state <liste>` | `open,draft,merged` | Virgülle: `open`, `draft`, `merged`, `closed`; ya da hepsi için `all`. `open` yalnız draft olmayan açık PR'ları kapsar. |
| `--touching <regex>` | | Yalnız en az bir dosya yolu bu regex'e uyan PR'lar gösterilir. Tabloda `Eşleşen/Toplam` dosya sayısı yer alır. JavaScript regex sözdizimi kullanılır ve **büyük/küçük harfe duyarlıdır**: ikisi için `'Payment|payment'` ya da `'[Pp]ayment'`. |
| `--since <YYYY-AA-GG>` | | Bu tarihte ya da sonra **açılmış** PR'lar. |
| `--limit <n>` | `200` | Repo başına en fazla kaç PR okunur. En yeniden eskiye doğru okunur. |
| `--json` | | Tablo yerine JSON. `--touching` varsa eşleşen dosyaların listesi de verilir. |

### Durumlar

| Durum | Anlamı |
|---|---|
| `open` | Açık, draft değil. |
| `draft` | Açık, draft. |
| `merged` | Merge edilmiş. |
| `closed` | Merge edilmeden kapatılmış. Varsayılan olarak gösterilmez. |

## Nasıl çalışır

1. Bakılacak repoları belirler: `--repo`, `--repos` ya da bulunulan repo. `--repos` için her reponun origin URL'inden (https ya da ssh) `sahip/ad` çıkarılır; GitHub'da olmayan repolar atlanır.
2. Her repo için tek bir `gh pr list --state all --author <yazar> --limit <n>` çağrısı yapılır, en fazla 4 repo eşzamanlı.
3. Durum ve `--since` süzgeçleri uygulanır.
4. `--touching` verildiyse kalan her PR'ın dosyaları `gh api --paginate repos/<sahip>/<ad>/pulls/<n>/files` ile **eksiksiz** alınır (en fazla 4 eşzamanlı; terminalde ilerleme gösterilir) ve regex'e uyanlar sayılır. Hiç eşleşmeyen PR'lar listeden çıkarılır, sayıları özet satırında belirtilir.
5. Sonuç repo adına, sonra PR numarasına göre (yeniden eskiye) sıralanır.

Bir repo ya da bir PR'ın dosyaları alınamazsa (yetki yok, repo yok vb.) diğerleri etkilenmez. Sorunlar sonda `Hatalar:` altında listelenir ve komut 1 koduyla çıkar. `gh` hiç bulunamazsa ya da hiçbir repoda çalışmazsa komut baştan durur.

## Örnek

```sh
git kit prs
```

```
  #     Durum   Tarih       Branch              Başlık                          Dosya
  ────  ──────  ──────────  ──────────────────  ──────────────────────────────  ─────
  #42   open    2026-11-20  feature/search      Arama sayfası                   12
  #41   draft   2026-11-18  feature/login-page  Giriş sayfası                   7
  #38   merged  2026-11-12  fix/null-check      Boş değer kontrolü              2

3 PR · 1 repo · durum: open,draft,merged · yazar: @me
```

Bir modüle dokunanlar, birden fazla repoda:

```sh
git kit prs --repos ~/code --touching '^src/(cart|payment)/' --since 2026-11-01
```

```
  Repo    #     Durum   Tarih       Branch                  Başlık                          Eşleşen/Toplam
  ──────  ────  ──────  ──────────  ──────────────────────  ──────────────────────────────  ──────────────
  api     #57   open    2026-11-21  feature/cart-badge      Sepet rozeti                    6/9
  api     #51   merged  2026-11-04  refactor/payment-retry  Ödeme yeniden deneme            3/104
  web     #19   draft   2026-11-15  feature/cart-page       Sepet sayfası                   4/4

3 PR · 3 repo · durum: open,draft,merged · yazar: @me · 2026-11-01 ve sonrası · dosya: /^src\/(cart|payment)\// · 11 PR'da eşleşen dosya yok, gösterilmedi
```

`#51`'in 104 dosyası var. Eşleşen 3 dosyadan biri 100. sıradan sonra gelseydi `gh pr view` ile kaçırılırdı.

Kapatılmış PR'lar dahil, JSON:

```sh
git kit prs --state all --touching 'Payment' --json
```

```json
[
  {
    "repo": "acme/api",
    "number": 51,
    "state": "merged",
    "title": "Ödeme yeniden deneme",
    "branch": "refactor/payment-retry",
    "createdAt": "2026-11-04T09:12:44Z",
    "mergedAt": "2026-11-06T15:30:02Z",
    "url": "https://github.com/acme/api/pull/51",
    "files": 104,
    "matchedFiles": ["src/payment/PaymentRetry.cs", "src/payment/PaymentOptions.cs", "tests/PaymentRetryTests.cs"]
  }
]
```

Herkesin PR'ları, belirli repolarda:

```sh
git kit prs --repo acme/api,acme/web --author all --state open,draft
```

## Sık karşılaşılan durumlar

| Mesaj | Anlamı / çözüm |
|---|---|
| `gh bulunamadı` | `gh` kurulu değil: https://cli.github.com, ardından `gh auth login`. |
| `gh çalışmadı: ...` | Oturum kapalı ya da ağ yok. `gh auth status` ile kontrol et. |
| `Bu klasör origin'i GitHub'da olan bir repo değil` | Repo dışındasın ya da origin GitHub'da değil. `--repo` ya da `--repos` ver. |
| `--touching geçersiz regex` | Regex sözdizimi hatalı. Shell'in özel karakterleri yorumlamaması için tek tırnak kullan. |
| `N PR'da eşleşen dosya yok, gösterilmedi` | Bilgi mesajı: süzgeçlere uyan ama regex'e uyan dosyası olmayan PR sayısı. |

## Performans

- `--touching` olmadan repo başına tek çağrı yapılır; birkaç saniye sürer.
- `--touching` ile PR başına en az bir çağrı daha yapılır. Onlarca PR'da 10–20 saniye sürebilir. Süzgeçlerle (`--state`, `--since`, `--limit`) PR sayısını azaltmak hızlandırır.

## İlgili komutlar

- [`overview`](overview.md): yerel branch'lerin yanında PR durumunu gösterir.
- [`repos-status`](repos-status.md): tüm repolarda geçerli branch'in PR'ını ve yerel durumu gösterir.
