# git kit sync

> **Kip: [kuru çalışır]** · Grup: Günlük akış · Kaynak: [`commands/sync.js`](../../commands/sync.js)

Upstream'inin **gerisinde kalan** yerel branch'leri origin'e fast-forward eder.

## Ne işe yarar

`git fetch` yalnızca `origin/*` referanslarını günceller. Yerel `develop`, `main` ve takip ettiğin feature branch'ler geride kalır. `sync` bunları tek seferde ileri sarar.

**Asla** merge commit'i oluşturmaz, rebase yapmaz, commit kaybettirmez. Yalnızca fast-forward yapılabilen branch'lere dokunur; diğerlerini gerekçesiyle atlar.

## Ne zaman

- Güne başlarken.
- Branch açmadan ya da rebase yapmadan önce.
- Bir süre başka işle uğraştıktan sonra yerel branch'leri toparlamak istediğinde.

## Kullanım

```sh
git kit sync [seçenekler]
```

Reponun içinden çalıştırılır. Tüm worktree'lerdeki branch'leri kapsar.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** Seçeneksiz çalıştırınca **kuru çalışır**: neyin ilerletileceğini listeler, hiçbir şeye dokunmaz.
> `--apply` listelenenleri uygular ve önce onay sorar (`e/H`, varsayılan Hayır).
> `--yes` onayı atlar; tek başına bir şey yapmaz, `--apply` ile kullanılır.
> `--no-fetch` baştaki fetch'i atlar.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| *(seçeneksiz)* | ✓ | Kuru çalıştırma. |
| `--apply` | ✓ | `[FF]` ile işaretlenenleri ilerletir, önce onay sorar. |
| `--yes` | ✓ | Onay sormaz. |
| `--no-fetch` | ✓ | Başta `git fetch --prune origin` yapmaz. |

## Nasıl çalışır

1. `git fetch --prune origin`
2. Her yerel branch için upstream'ini bulur. Upstream ayarlı değilse origin'de aynı adla duran branch kullanılır (ör. takip ayarı yapılmadan açılmış `main`). Upstream'i yerel bir branch olanlar kapsam dışıdır.
3. Önde ve geride commit sayısını hesaplar.
4. **Yalnızca geride olanları** ilerletir:
   - Branch bir worktree'de çıkışlıysa ve izlenen dosyalarda değişiklik yoksa orada `git merge --ff-only` çalışır.
   - Çıkışlı değilse ref doğrudan güncellenir: `git update-ref` eski sha'ya kilitli olarak çalışır, yani arada ref değişmişse güncelleme reddedilir.
5. İlerletilemeyenleri gerekçesiyle `[ATLA]` olarak listeler.

### Atlanma gerekçeleri

| Gerekçe | Ne yapmalı |
|---|---|
| `push edilmemiş N commit var` | Branch önde, geride değil. İlerletilecek bir şey yok; push etmeyi unutma. |
| `ayrışmış: N önde, M geride` | Hem yerelde hem origin'de farklı commit'ler var. Fast-forward mümkün değil; [`rebase`](rebase.md) kullan. |
| `origin/x silinmiş` | Upstream silinmiş, büyük ihtimalle PR merge edildi. Temizlik için [`branches`](branches.md). |
| `çıkışlı olduğu worktree'de N commit edilmemiş değişiklik var` | O worktree'de commit et ya da stash'le, sonra tekrar çalıştır. |
| `worktree dizini yok` | Klasörü silinmiş bir worktree kaydı. [`worktrees`](worktrees.md) temizler. |

## Örnek

```sh
git kit sync
```

```
git fetch --prune origin ...

İlerletilecek / atlanan branch'ler (3)
  [FF]   develop  12 commit  a1b2c3d4e → f5e6d7c8b  (worktree: ana)
  [ATLA] feature/login-page  — ayrışmış: 2 önde, 5 geride (git kit rebase)
  [ATLA] fix/null-check  — push edilmemiş 1 commit var

Özet: 1 branch ilerletilecek; 2 atlandı; 14 güncel; 3 branch'in origin'de upstream'i yok.
Kuru çalıştırma — hiçbir şey değişmedi. Uygulamak için --apply ekle.
```

```sh
git kit sync --apply
```

```
...
Devam edilsin mi? (e/H) e
  ilerletildi  develop  (+12)
```

## Güvenlik

- Yalnızca fast-forward yapılır. Yerel commit'in hiçbir koşulda kaybolmaz.
- Kirli worktree'deki branch'e dokunulmaz.
- Ref güncellemesi eski sha'ya kilitlidir; plan çıkarıldıktan sonra branch değiştiyse güncelleme reddedilir ve `Hatalar:` altında raporlanır.

## İlgili komutlar

- [`overview`](overview.md): sync sonrası genel durum.
- [`rebase`](rebase.md): ayrışmış branch'ler için.
- [`branches`](branches.md): upstream'i silinmiş branch'ler için.
