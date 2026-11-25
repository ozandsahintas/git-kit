# git kit rebase

> **Kip: [kuru çalışır]** · Grup: Günlük akış · Kaynak: [`commands/rebase.js`](../../commands/rebase.js)

Yedek alarak güvenli rebase yapar (varsayılan: `origin/<base>` üzerine; base ayarı yoksa `origin/develop`, bkz. [README › Base branch](../../README.md#base-branch-repo-başına-ayar)) ve istenirse güvenli force push yapar.

## Ne işe yarar

Elle yapılan şu sırayı tek komutta yapar:

**yedek branch aç → rebase → kontrol et → force push**

Geri dönüş her zaman tek satırdır.

Rebase başlamadan önce sana şunları gösterir:
- hedefte kaç yeni commit olduğu,
- hangi dosyalarda **çakışma beklendiği** (çalışma ağacına dokunmadan tahmin edilir),
- origin'deki branch'te başkasının push ettiği commit olup olmadığı.

## Ne zaman

- PR açmadan ya da PR'ı güncellemeden önce.
- `sync` bir branch'i "ayrışmış" diye atladığında.
- Bir branch'i release branch'i gibi farklı bir tabana taşımak istediğinde (`--onto`).

## Kullanım

```sh
git kit rebase [seçenekler]
```

**Rebase edilecek branch'in içinden** çalıştırılır.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** Seçeneksiz çalıştırınca **kuru çalışır**: durumu ve çakışma tahminini gösterir, hiçbir şeye dokunmaz.
> `--apply` yedek alıp rebase eder ve önce onay sorar (`e/H`, varsayılan Hayır).
> `--yes` onayı atlar, yalnızca `--apply` ile anlamlıdır.
> `--push` başarılı rebase sonrası `--force-with-lease` ile push eder.
> `--no-fetch` baştaki fetch'i atlar.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| *(seçeneksiz)* | ✓ | Kuru çalıştırma: durum ve çakışma tahmini. |
| `--apply` | ✓ | Yedek alır ve rebase eder, önce onay sorar. |
| `--yes` | ✓ | Onay sormaz. |
| `--push` | ✓ | Başarılı rebase sonrası force-with-lease push. Upstream yoksa `push -u`. |
| `--no-fetch` | ✓ | Başta fetch yapmaz. |
| `--onto <ref>` | | Hedef. Varsayılan: `origin/<base>` (base ayarı yoksa `origin/develop`). Ör. `origin/release/2.4`. |

## Nasıl çalışır

1. **Fetch ve durum:** branch'in hedefe göre durumunu yazar. Hedef zaten branch'in içindeyse "Zaten güncel" deyip çıkar.
2. **Çakışma tahmini:** `git merge-tree --write-tree` ile çalışma ağacına dokunmadan hangi dosyalarda çakışma beklendiğini listeler. git ≥ 2.38 gerekir, daha eski sürümde bu adım atlanır.
3. **Başkasının commit'leri:** origin'deki branch'te yerelde (rebase edilmiş kopyası olarak bile) bulunmayan commit varsa uyarır. `--push` ile birlikte verilmişse rebase'i **reddeder**, çünkü force push bu commit'leri silerdi.
4. **Engeller.** Biri bile varsa hiçbir şey yapılmaz ve komut 1 koduyla çıkar:
   - korumalı branch (`develop`, `main`, `master` ve repoda ayarlıysa base). Bunları rebase etmek yerine [`sync`](sync.md) kullan.
   - izlenen dosyalarda commit edilmemiş değişiklik,
   - yarım kalmış rebase, merge, cherry-pick ya da revert.

   Detached HEAD'de ya da hedef bulunamazsa (`Hedef bulunamadı: ...`) komut daha ilk adımda hata verip durur.
5. **Yedek:** `backup/<kısa-ad>-YYYYMMDD-HHmm` branch'ini oluşturur. Aynı dakikada ikinci kez çalışırsa `-2`, `-3` eki alır.
6. **`git rebase <hedef>`**
   - **Çakışmada** durur ve devam, vazgeç ve yedeğe dönüş komutlarını yazar.
   - **Başarıda** `git range-diff` ile eski ve yeni commit'leri karşılaştırır.
7. **`--push`:** `--force-with-lease=<ref>:<rebase öncesi origin sha'sı>` ile push eder. Asla düz `--force` kullanmaz.

## Örnek

```sh
git kit rebase
```

```
git fetch --prune origin ...

Branch: feature/login-page
Hedef:  origin/develop  (hedefte 5 yeni commit var, bu branch'teki 2 commit yeniden uygulanacak)
Çakışma tahmini: 1 dosyada çakışma bekleniyor:
  ! src/auth/login-service.ts

Kuru çalıştırma — hiçbir şey değişmedi. Uygulamak için --apply ekle.
```

```sh
git kit rebase --apply --push
```

```
...
Yedek alınıp rebase edilsin mi? (e/H) e

Yedek: backup/login-page-20261125-1430
Successfully rebased and updated refs/heads/feature/login-page.

Eski (backup/login-page-20261125-1430) ve yeni commit'lerin karşılaştırması:
1:  a1b2c3d = 1:  e4f5a6b feat: giriş sayfası
2:  b2c3d4e = 2:  f5a6b7c fix: export tarih biçimi

...push çıktısı...
Geri dönmek istersen: git reset --hard backup/login-page-20261125-1430
```

### Çakışma olursa

```
Rebase çakışmayla durdu.
  Devam:          çakışmaları çöz → git add <dosya> → git rebase --continue
  Vazgeç:         git rebase --abort
  Yedeğe dön:     git rebase --abort && git reset --hard backup/login-page-20261125-1430
  Bitince push:   git push --force-with-lease origin feature/login-page
```

## Güvenlik

- Yedek branch rebase'den **önce** oluşturulur. Ne olursa olsun `git reset --hard <yedek>` ile başlangıç noktasına dönersin.
- Force push yalnızca `--force-with-lease` ile ve rebase öncesi görülen sha'ya kilitli yapılır.
- Origin'de senin olmayan commit varken `--push` reddedilir. Önce `git pull --rebase` ile al.
- Yedek branch eski commit'leri tuttuğu için [`branches`](branches.md) onu `--force` olmadan silmez. İşin bitince `git kit branches --only backup/<ad> --force --apply` ile kaldırabilirsin.

## İlgili komutlar

- [`sync`](sync.md): korumalı branch'leri ve fast-forward yapılabilenleri günceller.
- [`branches`](branches.md): eski `backup/*` branch'lerini temizler.
