# git kit

Günlük git akışı için küçük ve kontrollü komutlar: yeni işe başlamak, branch'leri güncel tutmak, güvenli rebase, commit taşıma, stash'i geri almak, durum raporları ve temizlik.

```sh
git kit sync --apply          # geride kalan yerel branch'leri origin'e fast-forward et
git kit start login-page      # origin/develop'tan feature/login-page aç
git kit overview              # tüm branch'ler tek tabloda: upstream, develop farkı, PR durumu
git kit prs --touching '^src/auth/'   # açtığın PR'lardan src/auth'a dokunanlar
```

Bütün komutlar aynı ilkeyle çalışır: **önce ne yapacağını gösterir, sen onaylamadan hiçbir şeyi değiştirmez.**

---

## Kurulum

Gereksinimler:

| Araç | Sürüm | Ne için |
|---|---|---|
| Node.js | ≥ 16 | komutların kendisi (bağımlılık yok, `npm install` gerekmez) |
| git | **≥ 2.36**; **≥ 2.38** önerilir | worktree okuma `git worktree list --porcelain -z` (2.36) ister; `rebase`'in çakışma tahmini `git merge-tree --write-tree` (2.38) ister, daha eski sürümde tahmin adımı atlanır |
| [gh](https://cli.github.com/) | `prs` için zorunlu, diğerleri için isteğe bağlı | `prs` komutu; `overview` ve `repos-status`'taki PR kolonu. `gh auth login` ile oturum açık olmalı. |

```sh
cd git-kit
npm link            # git-kit komutunu global olarak bağlar
git kit help        # kontrol
```

`npm link`, bu klasöre bir sembolik link oluşturur. Klasördeki her değişiklik anında devreye girer, yeniden kurulum gerekmez. Git, `PATH`'te `git-kit` adında bir program bulduğu için `git kit <komut>` şeklinde çağrılabilir.

Kaldırmak için: `npm unlink -g git-kit`

> **Not:** `git kit --help` git'in man sayfasını arar ve hata verir. Yardım için `git kit help` ya da `git kit <komut> -h` kullan.

---

## Ortak seçenekler

Bu seçenekler birden fazla komutta **aynı anlamda** kullanılır. Bir seçeneği bir komutta öğrendiysen diğerlerinde de aynı şekilde çalışır.

| Seçenek | Anlamı |
|---|---|
| *(seçeneksiz)* | **Kuru çalıştırma.** Değişiklik yapan komutlar seçeneksiz çalıştırıldığında yalnızca ne yapacaklarını listeler, hiçbir şeye dokunmaz. Her zaman güvenle çalıştırabilirsin. |
| `--apply` | Listelenen planı **gerçekten uygular**. Uygulamadan önce `Devam edilsin mi? (e/H)` diye onay sorar. Varsayılan cevap **Hayır**'dır; yalnız `e`, `evet`, `y` veya `yes` onay sayılır. |
| `--yes` | Onay sorusunu atlar. **Tek başına hiçbir şey yapmaz**, yalnız `--apply` ile birlikte anlamlıdır. Etkileşimsiz ortamda (script, CI, pipe) `--apply` verildiyse `--yes` zorunludur, yoksa komut `Etkileşimli terminal yok` hatasıyla durur. |
| `--no-fetch` | Başta yapılan `git fetch --prune origin` adımını atlar. Çevrimdışıyken işe yarar. Origin bilgisi eski kalabilir. |
| `--push` | İş başarıyla bittikten sonra sonucu origin'e gönderir. Push hiçbir zaman varsayılan değildir. |
| `--force` | Komutun **koruma kurallarını devre dışı bırakır**, ör. başka hiçbir yerde olmayan commit'i olan branch'i siler. Her zaman önce `--force` ile kuru çalıştırıp listeyi gör. |
| `--no-pr` | PR kolonunu atlar, `gh` çağrısı yapılmaz. |
| `-h`, `help` | `git kit <komut> -h` ya da `git kit help <komut>`: komutun ne yaptığını, adımlarını ve örneklerini gösterir. |

Başında yapılan `git fetch --prune` yalnızca `refs/remotes/origin/*` altını günceller. Yerel branch'lerine, çalışma ağacına ve stash'lerine dokunmaz.

Değer alan seçenekler iki şekilde yazılabilir: `--to release/2.4` ya da `--to=release/2.4`. Tanınmayan bir seçenek verilirse komut hiçbir şey yapmadan durur. Yanlış yazılmış komut adında ise en yakın komutu önerir (`Bunu mu demek istedin: git kit sync`).

### Hangi komut hangi ortak seçeneği alır

| Komut | `--apply` | `--yes` | `--no-fetch` | `--push` | `--force` | `--no-pr` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| [start](docs/commands/start.md) | | | ✓ | ✓ | | |
| [sync](docs/commands/sync.md) | ✓ | ✓ | ✓ | | | |
| [rebase](docs/commands/rebase.md) | ✓ | ✓ | ✓ | ✓ | | |
| [port](docs/commands/port.md) | ✓ | ✓ | ✓ | ✓ | | |
| [stash-apply](docs/commands/stash-apply.md) | ✓ | ✓ | | | | |
| [overview](docs/commands/overview.md) | | | ✓ | | | ✓ |
| [repos-status](docs/commands/repos-status.md) | | | *(bkz. `--fetch`)* | | | ✓ |
| [prs](docs/commands/prs.md) | | | | | | |
| [worktrees](docs/commands/worktrees.md) | ✓ | ✓ | ✓ | | ✓ | |
| [branches](docs/commands/branches.md) | ✓ | ✓ | ✓ | | ✓ | |
| [stash-export](docs/commands/stash-export.md) | | | | | | |

`repos-status` diğerlerinin tersine varsayılan olarak fetch **yapmaz**; istersen `--fetch` ile açarsın. Çünkü onlarca repoyu tarar. `prs` git'e değil GitHub'a baktığı için fetch yapmaz.

---

## Base branch (repo başına ayar)

Bazı komutlar bir **base branch**'e göre çalışır:

| Komut | Base'i nasıl kullanır |
|---|---|
| [`start`](docs/commands/start.md) | Yeni branch'i `origin/<base>`'ten açar (`--from` verilmezse). |
| [`rebase`](docs/commands/rebase.md) | `origin/<base>` üzerine rebase eder (`--onto` verilmezse). |
| [`overview`](docs/commands/overview.md) | Base kolonunu ve `Merged` kolonunu `origin/<base>`'e göre hesaplar; kolonun başlığı base'in adıdır. |
| [`rebase`](docs/commands/rebase.md), [`branches`](docs/commands/branches.md) | Base'i `develop`, `main`, `master` ile birlikte **korumalı** sayar: rebase edilmez, silinmez. |
| [`branches`](docs/commands/branches.md), [`worktrees`](docs/commands/worktrees.md) | "Commit başka yerde güvende mi?" kontrolünde base'teki commit'leri güvende sayar. |

Base şöyle belirlenir:

1. Repoda `git config kit.base <branch>` ayarı varsa o kullanılır (`origin/` önekiyle de yazılabilir).
2. Yoksa `develop`.

```sh
git config kit.base main          # bu repoda base: origin/main
git config --get kit.base         # bakmak için
git config --unset kit.base       # varsayılana (develop) dönmek için
```

Ayar o reponun `.git/config` dosyasına yazılır ve **yalnız o repoyu** etkiler. Her repo kendi base'ini taşır; repolar arasında geçerken hiçbir şeyi değiştirmen gerekmez. Ortam değişkeni bu yüzden tercih edilmedi: tek bir değer olurdu ve her repo geçişinde değiştirilmesi gerekirdi.

Tek seferlik farklı bir taban için ayara dokunmadan `start --from <ref>` ya da `rebase --onto <ref>` kullan.

---

## Çalışma kipleri

Her komutun bir kipi vardır. Kip `git kit help` çıktısında köşeli parantez içinde görünür.

| Kip | Davranış |
|---|---|
| **[kuru çalışır]** | Seçeneksiz çalıştırınca yalnızca planı listeler. `--apply` ile uygular ve önce onay sorar. Planı tek parça olan komutlar (`rebase`, `port`, `stash-apply`) bir **engel** bulursa `--apply` verilse bile hiçbir şey uygulamaz ve 1 koduyla çıkar. Öğe öğe çalışan komutlar (`sync`, `worktrees`, `branches`) sorunlu öğeyi `[ATLA]` ile işaretleyip geri kalanı uygular. |
| **[salt okunur]** | Yalnızca rapor verir, hiçbir şeyi değiştirmez. |
| **[doğrudan]** | Yalnızca **ekleme** yapar (branch, worktree ya da dosya oluşturur). Mevcut hiçbir şeyi silmediği ya da değiştirmediği için onay sormadan hemen çalışır. |

---

## Komutlar

| Komut | Kip | Ne yapar |
|---|---|---|
| **Günlük akış** | | |
| [`start <ad>`](docs/commands/start.md) | doğrudan | `origin/<base>`'ten yeni branch açar, istersen ayrı worktree'de |
| [`sync`](docs/commands/sync.md) | kuru çalışır | Geride kalan yerel branch'leri origin'e fast-forward eder |
| [`rebase`](docs/commands/rebase.md) | kuru çalışır | Yedek alıp rebase eder, güvenli force push yapar |
| [`port <commit>... --to <branch>`](docs/commands/port.md) | kuru çalışır | Commit'leri checkout yapmadan başka branch'e taşır |
| [`stash-apply [stash]`](docs/commands/stash-apply.md) | kuru çalışır | Stash'i uygular; diskte birebir aynı duran untracked dosyalara takılmaz |
| **Durum / rapor** | | |
| [`overview`](docs/commands/overview.md) | salt okunur | Branch panosu: upstream ve base farkı, merge, PR, yaş |
| [`repos-status [kök]`](docs/commands/repos-status.md) | salt okunur | Bir klasördeki tüm repolarda unutulmuş iş var mı raporu |
| [`prs`](docs/commands/prs.md) | salt okunur | PR'larını durum ve dokunduğu dosyalara göre listeler (bir ya da çok repo) |
| **Temizlik** | | |
| [`worktrees`](docs/commands/worktrees.md) | kuru çalışır | Ana worktree dışındaki worktree'leri siler |
| [`branches`](docs/commands/branches.md) | kuru çalışır | Origin'de olmayan yerel branch'leri siler (log'lu) |
| [`stash-export [stash] [hedef]`](docs/commands/stash-export.md) | doğrudan | Stash'teki dosyaları uygulamadan klasöre kopyalar |

---

## Önerilen akışlar

| Ne zaman | Komut |
|---|---|
| Sabah | `git kit sync --apply` → `git kit overview` |
| Yeni iş | `git kit start <ad> --worktree` |
| PR öncesi | `git kit rebase` → `git kit rebase --apply --push` |
| Fix'i başka branch'e taşı | `git kit port <commit> --to <branch> --apply --push` |
| Stash'i geri al | `git kit stash-apply` → `git kit stash-apply --apply` |
| Bir modüle dokunan PR'lar | `git kit prs --touching '<yol regex>'` (çok repo: `--repos <kök>`) |
| Temizlik | `git kit worktrees --apply` → `git kit branches --apply` |
| Gün sonu | `git kit repos-status` |

---

## Güvenlik ilkeleri

- **Önce plan, sonra uygulama.** Değişiklik yapan her komut kuru çalışır. `--apply` verilse bile onay sorar.
- **Geri dönüş her zaman tek satır.**
  - `rebase` başlamadan `backup/<ad>-<tarih>` yedek branch'ini oluşturur.
  - `branches` sildiği her branch'in sha'sını [`session/`](#session-klasörü) altındaki `removed-branches.log` dosyasına yazar.
  - `stash-apply` kaldırdığı dosyaları `session/stash-backups/` altına yedekler.
- **Force push yalnızca `--force-with-lease` ile yapılır** ve rebase öncesi görülen sha'ya kilitlenir. Düz `--force` hiç kullanılmaz.
- **Korumalı branch'ler** (`develop`, `main`, `master` ve repoda ayarlıysa [base](#base-branch-repo-başına-ayar)) hiçbir komut tarafından silinmez ya da rebase edilmez.
- **Commit kaybettiren işlem `--force` ister.** Başka hiçbir yerde olmayan commit'i olan bir branch ya da worktree varsayılan olarak atlanır.

---

## Repo yapısı

```
git-kit/
├── git-kit.js              # giriş noktası: komut listesi, yardım, argüman yönlendirme
├── lib.js                  # tüm komutların ortak yardımcıları (git çağrısı, seçenek ayrıştırma, onay, gh)
├── commands/               # her komut tek dosya, aynı modül sözleşmesi
│   ├── start.js  sync.js  rebase.js  port.js  stash-apply.js
│   ├── overview.js  repos-status.js  prs.js
│   └── worktrees.js  branches.js  stash-export.js
├── docs/
│   ├── commands/<komut>.md # her komutun ayrıntılı dokümanı
│   └── gelistirme.md       # iç yapı ve yeni komut ekleme rehberi
├── package.json            # bin: git-kit → git-kit.js (bağımlılık yok)
├── .gitignore              # yalnızca session/
└── session/                # yerel çıktılar, git'e girmez (çalışma zamanında oluşur, bkz. aşağı)
```

### session klasörü

git kit'in ürettiği her şey git kit klasöründeki `session/` altında toplanır. Komutlar üzerinde çalıştıkları **repoya hiçbir dosya bırakmaz**. Klasör ilk ihtiyaçta oluşur ve `.gitignore`'da olduğu için kitin repo'suna da girmez.

```
session/
├── removed-branches.log                    # branches --apply: zaman<TAB>branch<TAB>sha (geri alma kaydı)
├── stashed-files/<repo>-<branch>-<tarih>/  # stash-export varsayılan hedefi
└── stash-backups/<repo>-<tarih>/           # stash-apply'ın kaldırmadan önce aldığı yedekler
```

Klasör adlarındaki repo adı ve zaman damgası, farklı repolardaki ya da aynı branch'ten alınmış çıktıların birbirinin üzerine yazmasını önler. Eski dışa aktarımları ve yedekleri istediğin zaman elle silebilirsin. `removed-branches.log`'u ise silinmiş bir branch'i geri getirme ihtimalin olduğu sürece saklaman önerilir.

Paketin ve klasörün adı `git-kit`. İç yapı, modül sözleşmesi ve yeni komut ekleme adımları için: [docs/gelistirme.md](docs/gelistirme.md)
