# Geliştirme rehberi

git kit'in iç yapısı, komut modüllerinin sözleşmesi, ortak yardımcılar ve yeni komut ekleme adımları.

Kullanım dokümanı için: [README](../README.md)

---

## Mimari

```
git kit <komut> [argümanlar]
   │
   ▼
git-kit.js ── komut adını çözer (yanlış yazımda en yakını önerir), -h/help ise usage basar,
   │          değilse argümanları komutun options tanımına göre ayrıştırır
   ▼
commands/<komut>.js ── main(options): planı kurar, yazdırır, istenirse uygular
   │
   ▼
lib.js ── git/gh çağrıları, seçenek ayrıştırma, onay, tablo, base branch, yedek, ...
```

- **Bağımlılık yok.** Yalnızca Node.js çekirdek modülleri kullanılır (`child_process`, `fs`, `path`, `readline`, `os`, `crypto`). `npm install` gerekmez.
- **git ve gh dış süreç olarak çağrılır.** Kütüphane kullanılmaz; davranış, kullanıcının terminalde gördüğüyle aynıdır.
- **Kullanıcıya dönük her metin Türkçedir.** Komut adları ve seçenekler İngilizcedir.

### git-kit.js

- `COMMANDS` dizisi komutları `commands/<ad>.js`'ten yükler. **Dizideki sıra, `git kit help` çıktısındaki sıradır.**
- `GROUPS` yardımdaki grup başlıklarıdır: `Günlük akış`, `Durum / rapor`, `Temizlik`. Her komut `group` alanıyla bunlardan birine düşer.
- Genel yardım (`generalHelp`), komutların `name`, `args`, `mode` ve `summary` alanlarından **otomatik** üretilir. Ortak seçenekler, base branch ve önerilen akışlar bölümleri ise elle yazılır; yeni bir ortak seçenek ya da akış eklenince burası da güncellenir.
- Bilinmeyen komutta Levenshtein uzaklığı ≤ 3 olan ya da verilen adla başlayan en yakın komut önerilir.
- `git kit <komut> -h` ve `git kit help <komut>`, komutun `usage` metnini basar.

---

## Komut modülü sözleşmesi

Her `commands/<ad>.js` dosyası şu nesneyi dışa aktarır:

```js
module.exports = {
    name: 'ornek',                 // komut adı = dosya adı
    args: '<ad> [hedef]',          // yardımda addan sonra gösterilir (isteğe bağlı)
    group: 'Günlük akış',          // GROUPS'tan biri
    mode: 'kuru çalışır',          // 'kuru çalışır' | 'salt okunur' | 'doğrudan'
    summary: 'Tek satırlık açıklama',
    usage,                         // `git kit help ornek` metni (aşağıdaki şablona bak)
    options: {
        flags: ['--apply', '--yes', '--no-fetch'],  // değersiz bayraklar
        values: ['--to'],                           // değer alan seçenekler (--to x ya da --to=x)
        positional: 1                               // false/0: yok, n: en fazla n, true: sınırsız
    },
    main                           // async (options) => void
};
```

### `options` nesnesi

`main`'e gelen nesne `lib.parseOptions` tarafından üretilir:

- Bayraklar camelCase anahtara dönüşür ve varsayılanı `false`'tur: `--no-fetch` → `options.noFetch`, `--prefer-stash` → `options.preferStash`.
- Değerli seçenekler verilmediyse `undefined`'dır: `--to release/2.4` → `options.to === 'release/2.4'`.
- Konumsal argümanlar `options.positional` dizisindedir.
- Tanınmayan seçenek, fazla konumsal argüman ya da değersiz bırakılmış değerli seçenek, `main` çağrılmadan hata verir.

### Hata ve çıkış kodu

- **Devam edilemeyen hata:** `throw new Error('mesaj')`. `lib.run` mesajı basar ve 1 koduyla çıkar. Yığın izi gösterilmez, mesaj kullanıcıya dönük olmalıdır.
- **Engel (plan uygulanamaz):** engelleri listele, `process.exitCode = 1` yap ve `return`. Kuru çalıştırmada da aynı davranış korunur.
- **Kısmi başarısızlık** (bazı öğeler uygulanamadı): hataları bir diziye topla, sonda `lib.printFailures(failures)`. Bu fonksiyon `Hatalar:` başlığıyla basar ve çıkış kodunu 1 yapar.

---

## Kipler ve standart akış

### [kuru çalışır]

Değişiklik yapan komutların hepsi aynı akışı izler:

```js
async function main(options) {
    lib.prepare(options);                    // repo kontrolü + (--no-fetch yoksa) git fetch --prune origin

    const plan = buildPlan(options);         // hiçbir şeye dokunmadan ne yapılacağını hesapla
    printPlan(plan);                         // [SİL] / [ATLA] / [FF] gibi etiketlerle listele

    const count = plan.filter(i => i.action !== 'skip').length;
    console.log(`\nÖzet: ${count} ... ; ${plan.length - count} atlandı.`);

    if (!options.apply) {
        console.log('Kuru çalıştırma — hiçbir şey değişmedi. Uygulamak için --apply ekle.');
        return;
    }
    if (!count) return;
    if (!(await lib.confirm('\nDevam edilsin mi? (e/H) ', options))) {
        console.log('İptal edildi.');
        return;
    }
    applyPlan(plan);                         // yalnız burada değişiklik yapılır
}
```

Kurallar:

- `buildPlan` **yan etkisizdir.** Yalnızca okur, hiçbir şey yazmaz.
- Her plan öğesinin bir `action`'ı ve atlanıyorsa bir `reason`'ı olur. Gerekçe kullanıcıya ne yapması gerektiğini söylemelidir, ör. `(önce git kit worktrees çalıştır)`.
- `--yes` yalnızca `lib.confirm` içinde okunur. Etkileşimsiz ortamda `--yes` yoksa `confirm` hata verir.
- Geri alınması zor her işlemden önce geri dönüş yolu hazırlanır: yedek branch (`lib.createBackup`), log satırı ya da dosya yedeği.

### [salt okunur]

`lib.prepare` (gerekiyorsa) → oku → `lib.printTable` → özet satırı. `--apply`/`--yes` almaz.

### [doğrudan]

Yalnızca yeni şey oluşturur (branch, worktree, dosya). Mevcut bir şeyi değiştirmediği ya da silmediği için onay sormaz. Hedef zaten varsa üzerine yazmak yerine durmalıdır, ör. `start`'ta `Klasör zaten var`.

### usage şablonu

```
git kit <ad> — tek satır

Ne işe yarar
  ...

Ne zaman            (isteğe bağlı)
  ...

Adımlar             (isteğe bağlı)
  1. ...

Kullanım (nereden çalıştırılır)
  git kit <ad> [seçenekler]

Seçenekler
  (seçeneksiz)  kuru çalıştırma: ...
  --apply       ... (önce onay sorar)
  --yes         onay sormaz
  ...

Örnekler
  git kit <ad>
  git kit <ad> --apply
```

---

## lib.js başvuru

### Sabitler

| Ad | Değer / anlamı |
|---|---|
| `REMOTE` | `'origin'` |
| `DEFAULT_BASE` | `'develop'`: `kit.base` ayarı yoksa base |
| `BASE_CONFIG_KEY` | `'kit.base'` |
| `PROTECTED` | `develop`, `main`, `master`. Base dahil tam küme için `protectedBranches()` kullan. |
| `SESSION_DIR` | `<kit>/session`: kitin ürettiği yerel çıktılar; `.gitignore`'da |
| `LOG_FILE` | `<kit>/session/removed-branches.log` |
| `DEFAULT_ROOT` | Kit klasörünün bir üstü; `repos-status` ve `prs --repos` için varsayılan kök |
| `PR_FIELDS` | PR kolonu için `gh --json` alanları |

### Base branch

| Fonksiyon | Açıklama |
|---|---|
| `base(cwd?)` | Repo'nun base adı: `git config kit.base` (varsa `origin/` öneki atılır), yoksa `develop`. Repo başına önbelleğe alınır. |
| `baseRef(cwd?)` | `origin/<base>` |
| `protectedBranches(cwd?)` | `PROTECTED` + base. Silme ve rebase kontrolleri bunu kullanmalı. |

Başka repoya bakan kod (ör. `repos-status`) `cwd` olarak o reponun yolunu vermelidir; her repo kendi `kit.base`'ini taşır.

### git çağrıları

| Fonksiyon | Açıklama |
|---|---|
| `git(argv, options?)` | `execFileSync('git', ...)`, stdout döner, hata fırlatır. Shell kullanılmaz; argümanlar kaçışsız güvenle geçer. |
| `gitOk(argv, options?)` | Çıkış kodu 0 mı (boolean). |
| `gitTry(argv, options?)` | Başarılıysa kırpılmış stdout, değilse `null`. |
| `errorText(error)` | Hatanın stderr'i ya da mesajı. |
| `prepare(options)` | Repo değilse hata; `--no-fetch` yoksa `git fetch --prune origin`. |

### Repo okuma

| Fonksiyon | Açıklama |
|---|---|
| `readWorktrees(cwd?)` | `git worktree list --porcelain -z` ayrıştırması: `{ path, head, branch, detached, locked, prunable }`. İlk kayıt her zaman ana worktree'dir. |
| `currentTopLevel()` | Bulunulan worktree'nin kökü (gerçek yol). |
| `currentBranch(cwd?)` | Branch adı; detached ise `null`. |
| `refExists(ref, cwd?)` | Tam ref var mı (`refs/heads/x`, `refs/remotes/origin/x`). |
| `resolveCommit(rev, cwd?)` | Commit sha'sı ya da `null`. |
| `aheadBehind(left, right, cwd?)` | `{ ahead, behind }` |
| `dirtyCount(path, untracked = true)` | Commit edilmemiş değişiklik sayısı. `false` verilirse yalnız izlenen dosyalar sayılır; merge ve rebase'i engelleyenler bunlardır. |
| `readBranches()` | Yerel branch'ler: `{ name, sha, subject }` |
| `readRemoteBranches()` | origin'deki branch adları (`Set`) |
| `keptBranches(branches, onRemote)` | Silinmeyecek branch'ler: origin'de karşılığı olanlar + korumalılar |
| `uniqueCommits(rev, kept)` | `rev`'den erişilip origin'de, etiketlerde ve `kept`'te olmayan commit sayısı. "Silinirse iş kaybolur mu?" sorusunun cevabı. |
| `gitVersionAtLeast(major, minor)` | git sürüm kontrolü |
| `predictConflicts(base, head)` | `git merge-tree --write-tree` ile çakışma tahmini; çakışan dosyalar ya da git < 2.38 ise `null` |

### Yazma ve yedek

| Fonksiyon | Açıklama |
|---|---|
| `shortName(branch)` | Bilinen öneki (`feature`, `feat`, `fix`, `bugfix`, `hotfix`, `refactor`, `chore`, `docs`, `test`, `release`, `backup`) atar, kalan `/`'leri `-` yapar. Worktree klasörü ve yedek adları için. |
| `createBackup(branch, rev = 'HEAD')` | `backup/<kısa-ad>-YYYYMMDD-HHmm` oluşturur, ad doluysa `-2`, `-3` ekler; adı döner. |
| `sessionDir(...parçalar)` | `<kit>/session/<parçalar>` klasörünü (yoksa oluşturarak) döner. Kitin ürettiği her dosya buraya yazılır. |
| `timestamp(date?)` | `YYYYMMDD-HHmmss`: session altındaki klasör adları için |
| `repoName(cwd?)` | Ana worktree klasörünün adı; linked worktree'den çalışınca da aynı ad döner. |

### GitHub (gh)

| Fonksiyon | Açıklama |
|---|---|
| `gh(argv, cwd?, timeout?)` | `{ ok, stdout, error, missing }` döner, **asla fırlatmaz**. `missing` gh kurulu değilse `true`. gh'nin stderr ipuçları yutulur. |
| `ghJson(argv, cwd?)` | JSON ya da `null`. gh'nin isteğe bağlı olduğu yerler (PR kolonu) için: `null` gelirse özellik sessizce düşer. |
| `myPullRequestsByBranch(cwd?)` | Kullanıcının PR'ları, head branch adına göre `Map`; gh kullanılamıyorsa `null`. |
| `prLabel(prs)` | `#42 open` / `draft` / `merged` / `closed`. Birden fazla PR'da açık > merged > kapalı, sonra en yeni. |
| `githubSlug(cwd?)` | origin URL'inden `sahip/ad` (https ve ssh); GitHub değilse `null`. |

gh **isteğe bağlı** bir özellik içinse (`overview`, `repos-status`) `ghJson` kullan ve `null`'da özelliği sessizce düşür. gh komutun **asıl işi** ise (`prs`) `gh` kullan ve `missing` ile `error`'ı anlaşılır bir mesaja çevir.

### Çıktı ve etkileşim

| Fonksiyon | Açıklama |
|---|---|
| `printTable(headers, rows, indent?)` | Hizalı düz metin tablo. |
| `relativeTime(unixSeconds)` | "3 gün önce" |
| `confirm(question, options)` | `options.yes` ise `true`; TTY yoksa hata; `e`/`evet`/`y`/`yes` → `true`. |
| `printFailures(failures)` | `Hatalar:` listesi + çıkış kodu 1. |
| `run(main)` | `main`'i çalıştırır; hata mesajını basıp 1 koduyla çıkar. |

### Diğer

| Fonksiyon | Açıklama |
|---|---|
| `parseOptions(hint, spec, argv)` | Sözleşmedeki `options` tanımına göre ayrıştırma (bkz. yukarı). |
| `mapLimit(items, limit, fn)` | En fazla `limit` eşzamanlı async işlem; sonuçlar giriş sırasıyla. |
| `findRepos(root)` | Kökün doğrudan alt klasörlerindeki repolar; linked worktree klasörleri hariç. |
| `realPath(p)` | Sembolik linkleri çözülmüş yol (yoksa `path.resolve`). |

---

## Dikkat edilecek tuzaklar

- **Yollar için `-z` kullan.** git, boşluklu ya da Türkçe karakterli yolları `-z` olmadan tırnaklayıp kaçışlar (`"docs/g\303\266rev.md"`). Yol listesi okuyan her çağrı `-z` ile yapılmalı ve `\0` ile bölünmelidir.
- **Stash'i önce sha'ya çevir.** git 2.56'da `stash@{0}^3^{commit}`, stash'in 3. ebeveyni yokken bile stash'in kendisine çözülüyor; `stash@{0}^3` ve `<sha>^3^{commit}` ise doğru şekilde başarısız oluyor. Stash ebeveynlerine bakan kod `const sha = lib.resolveCommit(stash)` ile başlayıp `${sha}^3` kullanmalı.
- **`gh pr view --json files` 100 dosyada keser.** Dosya listesi için `gh api --paginate repos/<sahip>/<ad>/pulls/<n>/files?per_page=100` kullan.
- **Ref güncellemesinde eski sha'yı ver.** `git update-ref <ref> <yeni> <eski>`: plan kurulduktan sonra ref değiştiyse güncelleme reddedilir.
- **Force push yalnız `--force-with-lease=<ref>:<beklenen sha>` ile yapılır.** Fetch'ten sonra alınan lease, başkasının push ettiği commit'leri yakalamaz; `rebase` bu yüzden ayrıca `git cherry` ile kontrol eder.
- **Çıktıyı repoya yazma.** Log, dışa aktarım ve yedek gibi kitin ürettiği her dosya `lib.sessionDir(...)` ile `<kit>/session/` altına yazılır. Klasör adına repo adı (`lib.repoName()`) ve zaman damgası (`lib.timestamp()`) eklenir ki farklı repoların ya da çalıştırmaların çıktıları çakışmasın. `session/` `.gitignore`'dadır.
- **Projeye özgü ad kullanma.** Kit genel amaçlıdır: kodda, yardım metinlerinde ve dokümanlarda gerçek repo adları, domain terimleri ya da ekip/kişi adları yer almaz. Örneklerde `my-app`, `acme/api`, `feature/login-page` gibi genel adlar kullanılır.

---

## Yeni komut ekleme

1. `commands/<ad>.js` dosyasını sözleşmeye uygun oluştur. Kipine göre yukarıdaki akışı izle. En yakın mevcut komutu şablon olarak kullan:

   | Kip | Şablon |
   |---|---|
   | kuru çalışır, öğe öğe | `worktrees.js` (en kısası), `branches.js` |
   | kuru çalışır, tek parça plan | `stash-apply.js`, `rebase.js` |
   | salt okunur | `overview.js` (tek repo), `repos-status.js` (çok repo), `prs.js` (gh) |
   | doğrudan | `start.js`, `stash-export.js` |

2. `git-kit.js`'teki `COMMANDS` dizisine adı, yardımda görünmesini istediğin sıraya ekle.
3. Ortak bir seçenek eklediysen ya da mevcut birini kullandıysan:
   - `git-kit.js` genel yardımındaki **Ortak seçenekler** bölümünü,
   - README'deki **Ortak seçenekler** tablosunu ve **Hangi komut hangi ortak seçeneği alır** matrisini güncelle.
4. `docs/commands/<ad>.md` dokümanını yaz. Mevcut dokümanların bölüm sırasını izle: kip satırı, Ne işe yarar, Ne zaman, Kullanım, Seçenekler (başta **Ortak seçenekler** kutusu), Nasıl çalışır, Örnek, Güvenlik, İlgili komutlar.
5. README'deki **Komutlar** tablosuna, gerekiyorsa **Önerilen akışlar**'a ve **Repo yapısı**'na ekle.
6. Doğrula (aşağıya bak).

---

## Doğrulama

Kalıcı bir test paketi yok. Değişiklikler geçici repolarda elle doğrulanır:

```sh
node --check lib.js git-kit.js commands/*.js        # sözdizimi

T=$(mktemp -d) && cd "$T"
git init -q --bare origin.git && git clone -q origin.git r && cd r
git config user.email t@t && git config user.name t
git switch -q -c develop && echo a > a && git add a && git commit -qm a && git push -q -u origin develop
# senaryoyu kur (branch'ler, worktree'ler, stash'ler...), sonra:
git kit <komut>                  # kuru çalıştırma çıktısını kontrol et
git kit <komut> --apply --yes    # uygula, git status / git log ile sonucu doğrula
```

Kontrol listesi:

- Kuru çalıştırma hiçbir şeyi değiştirmiyor mu? Öncesinde ve sonrasında `git status`, `git branch -a`, `git stash list` aynı olmalı.
- `--apply` onay soruyor mu? Etkileşimsiz ortamda `--yes` olmadan hata veriyor mu?
- Engel ve atlanma durumlarında anlaşılır gerekçe ve doğru çıkış kodu var mı?
- Boşluklu ve Türkçe karakterli dosya ve branch adları çalışıyor mu?
- Alt klasörden ve bir linked worktree'den çalıştırınca doğru davranıyor mu?
- gh kullanan özellikler, gh `PATH`'te yokken düzgün düşüyor mu? (`PATH`'te yalnız `node` ve `git` olan geçici bir klasörle dene.)
- `git kit help` ve `git kit <ad> -h` doğru görünüyor mu?
