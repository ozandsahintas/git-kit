# git kit repos-status

> **Kip: [salt okunur]** · Grup: Durum / rapor · Kaynak: [`commands/repos-status.js`](../../commands/repos-status.js)

Bir klasördeki tüm repoların durumunu raporlar: unutulmuş iş var mı? Hiçbir şeyi değiştirmez.

## Ne işe yarar

"Hiçbir yerde unutulmuş iş kalmadı mı?" sorusunu cevaplar. Kök klasörün **doğrudan alt klasörlerindeki** her repo için şunlara bakar:

| Durum notu | Anlamı |
|---|---|
| `N kirli dosya` | Ana worktree'de commit edilmemiş değişiklik (untracked dahil). |
| `↑N push edilmemiş` | Geçerli branch'te origin'e gitmemiş commit. |
| `↓N geride` | Geçerli branch origin'in gerisinde (son fetch'e göre). |
| `N commit yalnız yerelde (M branch)` | **Hiçbir remote branch'te olmayan** commit'ler, tüm yerel branch'ler dahil. Makine giderse kaybolacak iş. |
| `branch'in upstream'i yok` | Geçerli branch hiç push edilmemiş. |
| `N stash` | Unutulmuş stash'ler. |
| `N worktree (K kirli) (L dizini yok)` | Ek worktree'ler, içlerinde commit edilmemiş değişiklik olanlar ve klasörü silinmiş kayıtlar. |
| `detached HEAD` | Repo bir branch üzerinde değil. |
| `remote yok` | Reponun hiç remote'u yok. |
| `fetch hatası: ...` | `--fetch` verildiyse ve o repoda fetch başarısız olduysa. |

Not içermeyen repolar **temiz** sayılır ve varsayılan olarak listelenmez.

Linked worktree klasörleri (ör. `my-app-login-page`) ayrı repo sayılmaz; ait oldukları reponun `worktree` notunda raporlanır.

### PR kolonu

- Listelenen her reponun **geçerli branch'inden** açılmış PR'ı ve durumu gösterilir: `#42 open`, `#41 draft`, `#38 merged`, `#35 closed`.
- Repo başına bir `gh pr list --head <branch>` çağrısı yapılır, en fazla 4 eşzamanlı.
- Korumalı branch'ler (`develop`, `main`, `master`) sorgulanmaz. Bunlardan açılan sürüm PR'ları yanıltıcı olurdu. Detached HEAD de sorgulanmaz.
- `gh` hiçbir repoda cevap vermezse (kurulu değil, oturum yok) kolon **sessizce gösterilmez**.

## Ne zaman

- Gün sonunda.
- Makine değiştirmeden ya da izne çıkmadan önce: "yalnız yerelde" notu olan repo kalmasın.
- Sabah ilk iş, `--fetch` ile.

## Kullanım

```sh
git kit repos-status [kök] [seçenekler]
```

**Herhangi bir yerden** çalıştırılabilir. `kök` verilmezse git kit klasörünün bir üst klasörü kullanılır. Kit `~/Documents/GitHub/git-kit`'teyse kök `~/Documents/GitHub` olur.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** `repos-status` [salt okunur] kiptedir; **`--apply` ve `--yes` almaz**.
> Diğer komutların aksine **varsayılan olarak fetch yapmaz**, çünkü onlarca repoyu tarar. Bu yüzden `--no-fetch` yerine tersini yapan `--fetch` vardır.
> Ortak seçeneklerden `--no-pr` desteklenir.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| `[kök]` | | Taranacak klasör. Varsayılan: git kit klasörünün bir üstü. |
| `--fetch` | | Önce tüm repolarda paralel `git fetch --prune` (en fazla 4 eşzamanlı, repo başına 60 sn zaman aşımı). Bunu vermezsen `↓geride` bilgisi son fetch'e göredir. |
| `--all` | | Temiz repoları da `✓ temiz` olarak listeler. |
| `--no-pr` | ✓ | PR kolonunu atlar; `gh` çağrılmaz. |

## Örnek

```sh
git kit repos-status
```

```
/Users/ben/code altında 6 repo

  Repo     Branch          PR        Durum
  ───────  ──────────────  ────────  ──────────────────────────────────────────────
  api      develop                   8 kirli dosya, 3 stash
  web      main                      ↓16 geride
  mobile   feature/search  #42 open  4 kirli dosya, ↓3 geride, 1 worktree (1 kirli)
  infra    main                      2 commit yalnız yerelde (1 branch)

Özet: 4 repo dikkat istiyor, 2 temiz (temizleri görmek için --all).
Not: ↓geride bilgisi son fetch'e göre; güncel bilgi için --fetch.
```

```sh
git kit repos-status --fetch --all        # sabah: önce fetch, hepsini listele
git kit repos-status ~/work --no-pr       # başka kök, gh'siz
```

## Notlar

- Bir repo okunamazsa (bozuk `.git` vb.) o satırda `okunamadı: ...` yazar, diğer repolar etkilenmez.
- Yalnızca kökün **doğrudan** alt klasörlerine bakılır; iç içe repolar taranmaz.

## İlgili komutlar

- [`overview`](overview.md): tek repoda branch bazında ayrıntılı tablo.
- [`stash-export`](stash-export.md) / [`stash-apply`](stash-apply.md): raporda görünen unutulmuş stash'ler için.
- [`worktrees`](worktrees.md): "dizini yok" worktree kayıtları için.
