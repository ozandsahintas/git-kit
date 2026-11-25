# git kit stash-apply

> **Kip: [kuru çalışır]** · Grup: Günlük akış · Kaynak: [`commands/stash-apply.js`](../../commands/stash-apply.js)

Stash'i uygular. Stash'in geri yazacağı dosyalar diskte untracked olarak zaten duruyorsa takılmaz.

## Ne işe yarar

`git stash apply` şu durumda **tümden durur**: stash'in geri yazacağı bir dosya, çalışma ağacında untracked olarak zaten vardır.

```
hata: Birleştirme ile aşağıdaki izlenmeyen çalışma ağacı dosyalarının üzerine yazılacak:
	scripts/setup.sh
	...
İptal ediliyor
```

`git stash -u` ile alınmış stash'lerde ise `already exists, no checkout` hatası çıkar.

Bu durum özellikle GitHub Desktop'ın yeni (staged) dosyaları da stash'lemesinden sonra sık yaşanır: dosyanın bir kopyası diskte kalmıştır ya da yeniden oluşturulmuştur. Çoğu zaman diskteki kopya ile stash'teki kopya **birebir aynıdır**, ama git bunu kontrol etmez.

`stash-apply` her çakışan dosyayı stash'teki hâliyle karşılaştırır:

| Durum | Etiket | Ne yapılır |
|---|---|---|
| Birebir aynı | `[AYNI]` | Diskteki kopya yedeklenip kaldırılır, dosya stash'ten aynı içerikle geri gelir. |
| İçerik farklı | `[DUR]` | Varsayılan olarak **hiçbir şey uygulanmaz**. Hangisinin daha yeni olduğu yazılır. |
| İçerik farklı + `--prefer-stash` | `[STASH]` | Diskteki kopya yedeklenir, stash'teki hâli alınır. |
| Diskte klasör ya da link | `[DUR]` | Elle çözülmesi gerekir. |

Stash `pop` değil **`apply`** ile uygulanır; stash listede kalır.

> [!WARNING]
> Düz `git stash apply`, `-u` ile alınmış bir stash'te untracked dosyalarda hata verse bile **tracked kısmı yine de uygulayabilir** ve çalışma ağacını yarım bırakır. `stash-apply` çakışmaları önceden temizlediği için bu duruma düşmez.

## Ne zaman

- `git stash apply` ya da GitHub Desktop'taki "Restore" "üzerine yazılacak" veya "already exists" hatasıyla durduğunda.
- Bir stash'i geri almadan önce hangi dosyaların çakışacağını görmek istediğinde: seçeneksiz çalıştır.

## Kullanım

```sh
git kit stash-apply [stash] [seçenekler]
```

Reponun içinden (alt klasörden de olur) çalıştırılır. `stash` verilmezse `stash@{0}` kullanılır. Stash listesini `git stash list` ile görebilirsin.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** Seçeneksiz çalıştırınca **kuru çalışır**: çakışan dosyaları ve ne yapılacağını listeler, hiçbir şeye dokunmaz.
> `--apply` uygular ve önce onay sorar (`e/H`, varsayılan Hayır).
> `--yes` onayı atlar, yalnızca `--apply` ile anlamlıdır.
> Bu komut fetch yapmaz, o yüzden `--no-fetch` almaz.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| `[stash]` | | Uygulanacak stash. Varsayılan: `stash@{0}`. |
| *(seçeneksiz)* | ✓ | Kuru çalıştırma. |
| `--apply` | ✓ | Uygular, önce onay sorar. |
| `--yes` | ✓ | Onay sormaz. |
| `--prefer-stash` | | İçeriği farklı dosyalarda da stash'teki hâli alır; disktekiler yedeklenir. |

## Nasıl çalışır

1. Stash'i sha'ya çevirir; bütün sorgular sha ile yapılır. *(git 2.56'da `stash@{0}^3^{commit}` yazımı, 3. ebeveyn yokken bile stash'in kendisini döndürüyor. Sha ile bu tuzağa düşülmez.)*
2. Stash'in çalışma ağacına yazacağı dosyaları toplar:
   - tracked kısım: stash'in tabanı (`^1`) ile stash arasındaki farkın silinmeyen dosyaları,
   - `-u` ile alınmışsa untracked kısım (`^3`).
3. Bunlardan şu an **izlenmeyen** ve diskte duranları bulur. Her birinin içeriğini `git hash-object` ile stash'teki nesneyle karşılaştırır.
4. Plan ve özet yazılır. Bir tane bile `[DUR]` varsa hiçbir şey uygulanmaz ve komut 1 koduyla çıkar.
5. `--apply` ile:
   1. Kaldırılacak dosyalar git kit klasöründeki `session/stash-backups/<repo>-<YYYYMMDD-HHmmss>/` altına kopyalanır, sonra silinir.
   2. `git stash apply <stash>` çalışır.
   3. **Başarısız olursa** (ör. tracked bir dosyada yerel değişiklik çakışması), yerinde olmayan dosyalar yedekten geri konur.
   4. **Başarılı olursa** kaldırılan her dosyanın artık stash'teki içerikle birebir aynı olduğu doğrulanır.

## Örnek

```sh
git kit stash-apply
```

```
stash@{0}: diskte untracked olarak zaten duran dosyalar (3)
  [AYNI]  docs/görev notları/ayni dosya.md
  [DUR]   docs/tasks.md  — içerik farklı — disk 2 saat önce, stash 1 saat önce (stash daha yeni)
  [AYNI]  scripts/run.sh

Özet: 2 aynı (diskteki kaldırılır, stash'ten gelir); 0 farklı, stash'teki alınır; 1 engel.
Engel var — hiçbir şey uygulanmadı. İçeriği farklı dosyalar için --prefer-stash ver (disktekiler yedeklenir) ya da o dosyaları elle taşı.
```

`docs/tasks.md` için stash'teki sürüm daha yeni olduğundan onu almak istiyoruz:

```sh
git kit stash-apply --apply --prefer-stash
```

```
...
stash@{0} uygulansın mı? (e/H) e
  3 dosya yedeklenip kaldırıldı: /.../git-kit/session/stash-backups/my-app-20261124-175819
  git stash apply stash@{0} — tamam
    ...git status çıktısı...
  Doğrulandı: 3 dosya stash'teki içerikle birebir aynı.

Stash listede duruyor; artık gerekmiyorsa: git stash drop stash@{0}
```

Başka bir stash:

```sh
git kit stash-apply stash@{2} --apply
```

## Güvenlik

- Kaldırılan her dosya önce yedeklenir. Yedek repo dışında, git kit'in `session/` klasöründe durur; ne reponun ne de kitin commit'lerine girer.
- İçeriği farklı bir dosya, açıkça `--prefer-stash` demedikçe asla değiştirilmez.
- `git stash apply` başarısız olursa eksik dosyalar yedekten geri konur. Git'in kendi yazdığı dosyalara dokunulmaz.
- Stash silinmez. İşin bitince kendin `git stash drop` yaparsın.

## Kapsam dışı

- **Tracked dosyalardaki yerel değişikliklerle çakışma** (`Birleştirme ile aşağıdaki dosyalardaki yerel değişikliklerin üzerine yazılacak`): bu git'in kendi korumasıdır. Komut git'in hatasını gösterir ve kaldırdığı dosyaları geri koyar. Önce o değişiklikleri commit et ya da stash'le.
- **Merge çakışması** (stash'in tracked değişikliği mevcut koda uymuyorsa): git'in normal çakışma akışı geçerlidir.

## İlgili komutlar

- [`stash-export`](stash-export.md): stash'i uygulamadan içindeki dosyaları bir klasöre çıkarır. Uygulamadan önce incelemek için.
