# git kit overview

> **Kip: [salt okunur]** · Grup: Durum / rapor · Kaynak: [`commands/overview.js`](../../commands/overview.js)

Repodaki tüm yerel branch'lerin durumunu tek tabloda gösterir. Hiçbir şeyi değiştirmez.

## Ne işe yarar

"Ne nerede?" sorusunu cevaplar. Her yerel branch için şunları gösterir:

| Kolon | Anlamı |
|---|---|
| `*` | Şu an üzerinde olduğun branch. |
| **Branch** | Branch adı. Son commit tarihine göre, en yeni üstte. |
| **Upstream** | Origin'deki karşılığına göre: `güncel`, `↑2 ↓1` (önde/geride), `silinmiş` (upstream gitmiş, büyük ihtimalle PR merge edildi), `yok`. Upstream ayarlı değil ama origin'de aynı adla duruyorsa sonuna `(ayarsız)` eklenir. |
| **<base>** | `origin/<base>`'e göre önde (↑) ve geride (↓) commit sayısı. Kolonun başlığı base'in adıdır (ayar yoksa `develop`). |
| **Merged** | Branch'in bütün commit'leri `origin/<base>`'te mi (`evet`). |
| **PR** | Branch'ten açtığın PR ve durumu: `#42 open`, `#41 draft`, `#38 merged`, `#35 closed`. |
| **Son commit** | Son commit'in göreli zamanı ("2 gün önce"). |
| **Yazar** | Son commit'in yazarı. |
| **Worktree** | Branch'in çıkışlı olduğu worktree: `(ana)` ya da klasör adı. `(dizin yok)`: klasörü silinmiş bir worktree kaydı. |

Altta özet satırı yer alır: branch sayısı, kaçının base'e merge edildiği, ek worktree sayısı, stash sayısı. Merge edilmiş ve origin'de olmayan branch'ler varsa temizlik ipucu da verilir.

### PR kolonu

- Tek bir `gh pr list --author @me --state all` çağrısıyla alınır, git sorgularıyla paralel çalışır.
- Bir branch'in birden fazla PR'ı varsa (kapatılıp yeniden açılmış) öncelik şöyledir: **açık > merged > kapalı**. Aynı durumdakiler arasında en yeni numara seçilir.
- Yalnızca **senin açtığın** PR'lar gösterilir.
- `gh` kurulu değilse, oturum açık değilse ya da repo GitHub'da değilse kolon **sessizce gösterilmez**, komut normal çalışır.

## Ne zaman

- Temizlik komutlarından ([`worktrees`](worktrees.md), [`branches`](branches.md)) önce.
- Bir repoya uzun aradan sonra döndüğünde.
- PR durumlarını toparlarken: hangisi merge oldu, hangisi hâlâ açık, hangisi draft.
- `sync --apply` sonrası genel durumu görmek için.

## Kullanım

```sh
git kit overview [seçenekler]
```

Reponun içinden çalıştırılır.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** `overview` [salt okunur] kiptedir; hiçbir şeyi değiştirmediği için **`--apply` ve `--yes` almaz**. Ortak seçeneklerden `--no-fetch` (baştaki fetch'i atlar) ve `--no-pr` (gh çağrısını atlar) desteklenir.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| `--no-fetch` | ✓ | Başta `git fetch --prune origin` yapmaz. Upstream ve base kolonları son fetch'e göre olur. |
| `--no-pr` | ✓ | PR kolonunu atlar; `gh` çağrılmaz. Çevrimdışıyken ya da hız için. |
| `--stale <gün>` | | Son commit'i bu kadar günden eski branch'leri `[ESKİ]` ile işaretler ve özete sayısını ekler. |

## Örnek

```sh
git kit overview --no-fetch
```

```
     Branch              Upstream  develop  Merged  PR          Son commit    Yazar      Worktree
  ─  ──────────────────  ────────  ───────  ──────  ──────────  ────────────  ─────────  ──────────────
     feature/search      ↑1        ↑3 ↓0            #42 open    1 saat önce   Ayşe Y.    my-app-search
  *  develop             güncel    -        -                   2 saat önce   Mehmet K.  (ana)
     feature/login-page  güncel    ↑2 ↓6            #41 draft   1 gün önce    Ayşe Y.
     fix/null-check      silinmiş  ↑0 ↓9    evet    #38 merged  3 gün önce    Ayşe Y.
     feature/dark-mode   güncel    ↑4 ↓12           #35 closed  1 hafta önce  Ayşe Y.
     deneme/cache        yok       ↑2 ↓20                      2 hafta önce  Ayşe Y.

6 branch · 1 tanesi origin/develop'a merge edilmiş · 1 ek worktree · 2 stash
İpucu: merge edilmiş ve origin'de olmayan 1 branch `git kit branches` ile temizlenebilir.
```

Tabloyu okumak için ipuçları:

- `Merged = evet` ve `PR = merged`: iş bitmiş. Origin'den de silindiyse [`branches`](branches.md) temizler.
- `PR` boş ve base'e göre önde: henüz PR açılmamış iş.
- `PR = closed` ve Merged boş: PR kapatılmış ama merge edilmemiş. Branch gerekli mi, kontrol et.

`--stale` ile:

```sh
git kit overview --stale 30
```

İlk kolona `[ESKİ]` eklenir. Özet satırının sonuna `· 5 tanesi 30 günden eski` gelir.

## Notlar

- `origin/<base>` repoda yoksa (ör. ayar yapılmamış, base `develop` sanılıyor ama repoda yalnız `main` var) base ve Merged kolonları `-` kalır. Altta `Not: origin/develop bulunamadı ...` yazar ve `git config kit.base <branch>` önerilir.
- Base branch'in kendi satırında base ve Merged kolonları her zaman `-` olur.

## İlgili komutlar

- [`repos-status`](repos-status.md): aynı soruyu tüm repolar için, daha özet hâlde sorar.
- [`sync`](sync.md): geride kalan branch'leri ileri sarar.
- [`branches`](branches.md), [`worktrees`](worktrees.md): tablodaki gereksiz kalemleri temizler.
