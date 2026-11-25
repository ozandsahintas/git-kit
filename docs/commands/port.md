# git kit port

> **Kip: [kuru çalışır]** · Grup: Günlük akış · Kaynak: [`commands/port.js`](../../commands/port.js)

Commit'leri başka bir branch'e taşır. Mevcut çalışmana, stash'ine ve açık değişikliklerine dokunmaz.

## Ne işe yarar

"Bu fix'i `release/2.4`'e ya da `main`'e de at" işini **checkout yapmadan** halleder:

1. Hedef branch'i geçici bir worktree'de açar.
2. Commit'leri `git cherry-pick -x` ile uygular. Commit mesajına kaynak sha eklenir: `(cherry picked from commit ...)`.
3. Geçici worktree'yi siler.

Senin çalışma ağacın olduğu gibi kalır. Hedefte zaten bulunan (aynı patch'e sahip) commit'ler otomatik olarak atlanır.

## Ne zaman

- develop'ta yapılmış bir fix'i release ya da main branch'ine taşırken.
- Bir commit'i yanlış branch'e attığını fark edip doğru branch'e de koymak istediğinde.
- Bir feature branch'teki birkaç commit'i başka bir branch'e almak istediğinde.

## Kullanım

```sh
git kit port <commit | a..b>... --to <branch> [seçenekler]
```

Reponun içinden çalıştırılır. Commit olarak tekil sha veya ref (`a1b2c3d`, `HEAD~1`) ya da aralık (`a..b`) verilebilir; birden fazla argüman verilebilir.

**Merge commit'leri taşınmaz.** Tek başına merge commit verilirse komut durur. Aralık verildiğinde içindeki merge commit'ler atlanır, geri kalanı taşınır.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** Seçeneksiz çalıştırınca **kuru çalışır**: neyin taşınacağını ve neyin zaten hedefte olduğunu listeler.
> `--apply` taşır ve önce onay sorar (`e/H`, varsayılan Hayır).
> `--yes` onayı atlar, yalnızca `--apply` ile anlamlıdır.
> `--push` başarılı olursa hedef branch'i origin'e gönderir.
> `--no-fetch` baştaki fetch'i atlar.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| `--to <branch>` | | **Zorunlu.** Hedef branch. |
| *(seçeneksiz)* | ✓ | Kuru çalıştırma. |
| `--apply` | ✓ | Taşır, önce onay sorar. |
| `--yes` | ✓ | Onay sormaz. |
| `--push` | ✓ | Başarılı olursa `git push origin <hedef>`. Upstream yoksa `-u` ile. |
| `--no-fetch` | ✓ | Başta fetch yapmaz. |

## Nasıl çalışır

1. **Fetch ve commit çözümü.** Aralıklar `git rev-list --reverse --no-merges` ile eskiden yeniye sıralanır. Tekrar eden commit'ler bir kez sayılır.
2. **Hedef kontrolü:**
   - Hedef yerelde varsa ve upstream'inin gerisindeyse **durur** ("önce: git kit sync --apply"). Geride bir branch'e commit eklemek ileride çakışma demektir.
   - Hedef yerelde yok ama origin'de varsa, `origin/<hedef>`'ten takip eden yerel branch olarak oluşturulacağını söyler.
   - Hiçbir yerde yoksa durur.
3. **Zaten hedefte mi?** Commit hedefin geçmişindeyse ya da hedefte aynı patch'e sahip bir commit varsa (`git cherry`), `[ATLA]` ile işaretlenir.
4. **Çalışma yeri:**
   - Hedef bir worktree'de çıkışlıysa ve temizse cherry-pick orada yapılır.
   - Çıkışlı ama kirliyse komut durur.
   - Hiçbir worktree'de çıkışlı değilse sistem geçici dizininde geçici bir worktree açılır.
5. **`cherry-pick -x`**, commit commit. Uygulandığında boş kalan (değişikliği zaten hedefte olan) commit otomatik atlanır.
6. **Çakışmada** worktree olduğu gibi bırakılır ve nasıl devam edileceği yazılır.
7. Başarıda geçici worktree silinir. `--push` verildiyse hedef push edilir.

## Örnek

```sh
git kit port a1b2c3d e4f5a6b --to release/2.4
```

```
git fetch --prune origin ...

Hedef: release/2.4  (yerelde yok, origin/release/2.4'den oluşturulacak)
Çalışma yeri: geçici worktree (iş bitince silinir)

Commit'ler (2)
  [TAŞI] a1b2c3d4e  fix: boş değer kontrolü
  [ATLA] e4f5a6b7c  fix: tarih biçimi  — hedefte zaten var

Özet: 1 commit taşınacak; 1 atlandı.
Kuru çalıştırma — hiçbir şey değişmedi. Uygulamak için --apply ekle.
```

```sh
git kit port a1b2c3d --to release/2.4 --apply --push
```

```
...
Devam edilsin mi? (e/H) e
  taşındı  a1b2c3d4e  fix: boş değer kontrolü

release/2.4 artık 9f8e7d6c5
...push çıktısı...
```

Aralık örneği:

```sh
git kit port HEAD~3..HEAD --to main --apply --push   # son 3 commit
```

### Çakışma olursa

```
Çakışma: a1b2c3d4e  fix: boş değer kontrolü
Ondan önceki 1 commit hedef branch'e (release/2.4) uygulandı.
Çalışma dizini bırakıldı:

  cd "/var/folders/.../git-kit-port-1a2b3c4d"
  # çakışmaları çöz, git add <dosya>
  git cherry-pick --continue
  git cherry-pick -x e4f5a6b7c   # kalanlar

  Vazgeçmek için: git cherry-pick --abort
  İş bitince:     git worktree remove "/var/folders/.../git-kit-port-1a2b3c4d"
```

## Güvenlik

- Senin çalışma ağacında hiçbir şey değişmez; işlem ayrı bir worktree'de yapılır.
- Geride kalmış ya da kirli bir hedefe commit eklenmez; komut önce durur.
- `-x` sayesinde taşınan her commit'in kaynağı mesajında görünür.

## İlgili komutlar

- [`sync`](sync.md): hedef geride diye durduğunda önce bunu çalıştır.
- [`worktrees`](worktrees.md): çakışmada bırakılan geçici worktree'yi iş bitince temizler.
