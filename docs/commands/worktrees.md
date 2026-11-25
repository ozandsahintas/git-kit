# git kit worktrees

> **Kip: [kuru çalışır]** · Grup: Temizlik · Kaynak: [`commands/worktrees.js`](../../commands/worktrees.js)

Ana worktree dışındaki worktree'leri ve klasörü kaybolmuş worktree kayıtlarını temizler.

## Ne işe yarar

`git kit start --worktree` ya da `git worktree add` ile açılan worktree'ler iş bitince kalır. `worktrees`, ana worktree dışındaki tüm worktree'leri siler. Klasörü elle silinmiş ama git kaydında duran ("prunable") worktree'lerin kaydını da temizler.

**Branch'lere dokunmaz.** Worktree silinince branch'i yerinde kalır. Branch temizliği için bundan **sonra** [`branches`](branches.md) çalıştırılır. Çıkışlı branch'leri `branches` atlar, bu yüzden sıralama önemli.

## Ne zaman

- Bir grup iş bitip PR'lar merge edildikten sonra.
- `overview`'da "(dizin yok)" görünen worktree'ler olduğunda.
- [`branches`](branches.md)'ten önce.

## Kullanım

```sh
git kit worktrees [seçenekler]
```

Temizlenecek reponun içinden çalıştırılır. Ana worktree'den çalıştırmak en iyisi.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** Seçeneksiz çalıştırınca **kuru çalışır**: neyin silineceğini listeler, hiçbir şeyi silmez.
> `--apply` listelenenleri siler ve önce onay sorar (`e/H`, varsayılan Hayır).
> `--yes` onayı atlar, yalnızca `--apply` ile anlamlıdır.
> `--force` koruma kurallarını kapatır: commit edilmemiş değişikliği ya da benzersiz commit'i olan worktree'yi de siler. **Önce `--force` ile kuru çalıştırıp listeyi gör.**
> `--no-fetch` baştaki fetch'i atlar.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| *(seçeneksiz)* | ✓ | Kuru çalıştırma. |
| `--apply` | ✓ | `[SİL]` ile işaretlenenleri siler, önce onay sorar. |
| `--yes` | ✓ | Onay sormaz. |
| `--force` | ✓ | Kirli ya da benzersiz commit'li worktree'leri de siler (`git worktree remove --force`). |
| `--no-fetch` | ✓ | Başta fetch yapmaz. Origin bilgisi eski kalabilir; benzersiz commit kontrolü buna dayanır. |

## Nasıl çalışır

Ana worktree dışındaki her worktree için karar verilir:

| Durum | Karar |
|---|---|
| Şu an içinde çalıştığın worktree | `[ATLA]` (her zaman) |
| Klasörü yok (prunable) | `[SİL]`: yalnız kaydı temizlenir |
| Kilitli (`git worktree lock`) | `[ATLA]` (her zaman). Açmak için `git worktree unlock`. |
| Commit edilmemiş değişiklik var | `[ATLA]`; `--force` ile `[SİL]` |
| Detached HEAD ve oradaki commit'ler başka hiçbir yerde yok | `[ATLA]`; `--force` ile `[SİL]` |
| Diğerleri | `[SİL]` |

"Başka hiçbir yerde yok": commit, origin branch'lerinde, etiketlerde ve silinmeyecek yerel branch'lerde (origin'de karşılığı olanlar ile `develop`, `main`, `master` ve repoda ayarlıysa base) bulunmuyor demek.

`--apply` ile `git worktree remove` çalışır. Sonunda `git worktree prune` ile kayıtlar toparlanır.

## Örnek

```sh
git kit worktrees
```

```
git fetch --prune origin ...

Worktree'ler (4)
  [SİL]  /Users/ben/Documents/GitHub/my-app-login-page (feature/login-page)
  [SİL]  /Users/ben/Documents/GitHub/my-app-eski-deneme (fix/eski-deneme)  — dizini yok, kaydı temizlenecek
  [ATLA] /Users/ben/Documents/GitHub/my-app-null-check (fix/null-check)  — commit edilmemiş 3 değişiklik var
  [ATLA] /Users/ben/Documents/GitHub/my-app-search (feature/search)  — şu an içinde çalıştığın worktree

Özet: 2 worktree silinecek; 2 atlandı.
Kuru çalıştırma — hiçbir şey silinmedi. Uygulamak için --apply ekle.
```

```sh
git kit worktrees --apply
```

```
...
Devam edilsin mi? (e/H) e
  silindi  /Users/ben/Documents/GitHub/my-app-login-page
```

## Güvenlik

- Ana worktree, içinde çalıştığın worktree ve kilitli worktree'ler `--force` ile bile silinmez.
- Kirli ya da benzersiz commit'i olan worktree yalnızca `--force` ile silinir. `--force` açıkken uyarı basılır.
- Branch'ler silinmez; worktree silinse de commit'lerin branch'te durur.

## İlgili komutlar

- [`branches`](branches.md): bundan sonra çalıştır; worktree'den kurtulan branch'leri temizler.
- [`start`](start.md): `--worktree` ile yeni worktree açar.
