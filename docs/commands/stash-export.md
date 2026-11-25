# git kit stash-export

> **Kip: [doğrudan]** · Grup: Temizlik · Kaynak: [`commands/stash-export.js`](../../commands/stash-export.js)

Bir stash'teki dosyaları **uygulamadan** bir klasöre kopyalar.

## Ne işe yarar

Stash'i çalışma ağacına uygulamadan, içindeki değişmiş dosyaların **stash'teki hâlini** bir klasöre çıkarır. `git stash -u` ile alınmışsa untracked dosyalar da dahildir.

- Çalışma ağacına ve stash'e dokunmaz.
- Binary dosyalar güvenlidir; içerik doğrudan git nesnesinden okunur.
- Klasör yapısı korunur. Kopyalanan dosyaların listesi hedefteki `results.txt`'ye yazılır.

## Ne zaman

- Eski ve ne olduğu unutulmuş bir stash'in içeriğine bakmak istediğinde.
- Bir stash'ten yalnızca birkaç dosyayı almak istediğinde.
- Başka bir branch'e ait stash'i, o branch'e geçmeden incelemek istediğinde.
- Stash'i silmeden önce içeriğini arşivlemek istediğinde.
- [`stash-apply`](stash-apply.md) "içerik farklı" dediğinde farkı rahatça incelemek için.

## Kullanım

```sh
git kit stash-export [stash] [hedef]
```

Reponun içinden çalıştırılır.

| Argüman | Varsayılan |
|---|---|
| `stash` | `stash@{0}` (liste: `git stash list`) |
| `hedef` | git kit klasöründeki `session/stashed-files/<repo>-<branch>-<YYYYMMDD-HHmmss>/`. `<branch>` stash'in alındığı branch'tir (`/` → `-`). |

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** `stash-export` [doğrudan] kiptedir. Yalnızca **yeni dosya oluşturur**, çalışma ağacına ve stash'e dokunmaz. Bu yüzden **`--apply` ve `--yes` almaz**, hemen çalışır. Fetch yapmadığı için `--no-fetch` de almaz.
> Hedef klasörde aynı yolda dosya varsa **üzerine yazılır**. Her dışa aktarım için boş ya da yeni bir hedef klasör ver.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

Bu komutun ek seçeneği yoktur; yalnızca iki konumsal argüman alır.

## Nasıl çalışır

1. Stash'i sha'ya çevirir; bütün sorgular sha ile yapılır. *(git 2.56'da `stash@{0}^3^{commit}` yazımı, 3. ebeveyn yokken bile stash'in kendisini döndürüyor. Bu, `-u` olmadan alınmış stash'lerde komutun çökmesine yol açıyordu; sha ile düzeldi.)*
2. **Tracked değişiklikler:** stash'in tabanı (`^1`) ile stash arasındaki farkta, silinmeyen dosyalar.
3. **Untracked dosyalar:** stash `-u` ile alınmışsa 3. ebeveyndeki (`^3`) tüm dosyalar.
4. Her dosyanın içeriği `git show <nesne>:<yol>` ile okunur ve `hedef/<yol>` altına yazılır.
5. `hedef/results.txt`'ye `<yol>: <yazılan tam yol>` satırları yazılır.

## Örnek

```sh
git kit stash-export stash@{2} ~/Desktop/eski-deneme
```

```
3 dosya /Users/ben/Desktop/eski-deneme altına kopyalandı, liste: results.txt
```

```
~/Desktop/eski-deneme/
├── README
├── a/x.txt
├── b/boşluk adı.txt
└── results.txt
```

`results.txt`:

```
README: /Users/ben/Desktop/eski-deneme/README
a/x.txt: /Users/ben/Desktop/eski-deneme/a/x.txt
b/boşluk adı.txt: /Users/ben/Desktop/eski-deneme/b/boşluk adı.txt
```

Varsayılanlarla:

```sh
git kit stash-export          # stash → <kit>/session/stashed-files/my-app-develop-20261125-143012/
```

> [!TIP]
> Varsayılan hedef repo dışında, git kit'in `session/` klasöründe olduğu için reponda untracked dosya oluşturmaz ve iki dışa aktarım birbirinin üzerine yazmaz. Eski dışa aktarımları istediğin zaman `session/stashed-files/` altından silebilirsin.

## Sık karşılaşılan durumlar

| Mesaj | Anlamı |
|---|---|
| `Stash bulunamadı: stash@{9}` | Böyle bir stash yok. `git stash list` ile kontrol et. |
| `0 dosya ... kopyalandı` | Stash yalnızca silme içeriyor; silinen dosyalar dışa aktarılmaz. |

## İlgili komutlar

- [`stash-apply`](stash-apply.md): stash'i, diskte aynı duran dosyalara takılmadan uygular.
- [`repos-status`](repos-status.md): hangi repoda unutulmuş stash olduğunu gösterir.
