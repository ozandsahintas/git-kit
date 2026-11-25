# git kit branches

> **Kip: [kuru çalışır]** · Grup: Temizlik · Kaynak: [`commands/branches.js`](../../commands/branches.js)

Origin'de karşılığı olmayan yerel branch'leri temizler. Sildiği her branch'i log'a yazar, böylece geri alınabilir.

## Ne işe yarar

Zamanla yerelde şu branch'ler birikir:
- PR'ı merge edilip origin'den silinmiş ("gitti") branch'ler,
- `rebase`'in bıraktığı `backup/*` yedekleri,
- hiç push edilmemiş denemeler.

`branches`, origin'de karşılığı olmayan yerel branch'leri bulur ve **commit'leri başka bir yerde güvende olanları** siler. Commit'i başka hiçbir yerde olmayan branch'e `--force` olmadan dokunmaz.

Origin'de karşılığı olan branch'ler bu komutun kapsamında değildir, hiç listelenmez.

## Ne zaman

- PR'lar merge edildikten sonra.
- [`worktrees`](worktrees.md)'ten **sonra**. Worktree'de çıkışlı branch'ler atlanır.
- `overview` merge edilmiş ve origin'de olmayan branch'ler için temizlik ipucu verdiğinde.

## Kullanım

```sh
git kit branches [seçenekler]
```

Temizlenecek reponun içinden çalıştırılır.

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** Seçeneksiz çalıştırınca **kuru çalışır**: neyin silineceğini listeler, hiçbir şeyi silmez.
> `--apply` listelenenleri siler ve önce onay sorar (`e/H`, varsayılan Hayır).
> `--yes` onayı atlar, yalnızca `--apply` ile anlamlıdır.
> `--force` koruma kuralını kapatır: benzersiz commit'i olan branch'i de siler, yani **o commit'ler kaybolur** (log'dan geri alınabilir). `--force`'u mümkünse `--only` ile sınırla.
> `--no-fetch` baştaki fetch'i atlar.
> Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| *(seçeneksiz)* | ✓ | Kuru çalıştırma. |
| `--apply` | ✓ | `[SİL]` ile işaretlenenleri siler (`git branch -D`), önce onay sorar. |
| `--yes` | ✓ | Onay sormaz. |
| `--force` | ✓ | Benzersiz commit'i olan branch'leri de siler. |
| `--only <ad>[,<ad>...]` | | Yalnızca bu branch'lere bakar. `--force` ile birlikte verilince zorla silme **yalnızca bunlara** uygulanır. Adlar yerelde olmalı ve origin'de karşılığı olmamalı; değilse komut durur. |
| `--no-fetch` | ✓ | Başta `git fetch --prune` yapmaz. Origin bilgisi eski kalırsa yanlışlıkla "origin'de yok" sanılabilir; temizlikte fetch'li çalıştırmak önerilir. |

## Nasıl çalışır

1. `git fetch --prune origin`. Origin'den silinmiş branch'ler `origin/*` listesinden düşer.
2. Origin'de aynı adla karşılığı olmayan yerel branch'leri listeler (`--only` verildiyse yalnızca onları).
3. Her biri için karar verir:

| Durum | Karar |
|---|---|
| `develop`, `main`, `master` ve repoda ayarlıysa base (`git config kit.base`) | `[ATLA]` (her zaman) |
| Bir worktree'de çıkışlı | `[ATLA]` (her zaman). Ek worktree ise önce [`worktrees`](worktrees.md). |
| Commit'lerinden en az biri origin'de, etiketlerde ve korunan branch'lerde yok | `[ATLA]`; `--force` ile `[SİL]` ve kaç commit'in kaybolacağı yazılır |
| Diğerleri (tüm commit'leri başka yerde güvende) | `[SİL]` |

4. `--apply` ile `git branch -D` çalışır. Silinen her branch git kit klasöründeki `session/removed-branches.log` dosyasına `zaman<TAB>ad<TAB>sha` olarak eklenir.

## Örnek

```sh
git kit branches
```

```
git fetch --prune origin ...

Origin'de olmayan yerel branch'ler (4)
  [SİL]  fix/readme-typo  c4d5e6f7a  docs: README yazım hatası
  [SİL]  feature/dark-mode  d5e6f7a8b  feat: karanlık tema
  [ATLA] backup/login-page-20261120-1012  — 2 commit origin'de, etiketlerde ve korunan branch'lerde yok
  [ATLA] feature/search  — çıkışlı: /Users/ben/Documents/GitHub/my-app-search (önce git kit worktrees çalıştır)

Özet: 2 branch silinecek; 2 atlandı.
Kuru çalıştırma — hiçbir şey silinmedi. Uygulamak için --apply ekle.
```

Belirli bir yedeği zorla silmek:

```sh
git kit branches --only backup/login-page-20261120-1012 --force --apply
```

```
...
UYARI: --force açık, koruma kuralları yalnızca şunlar için devre dışı: backup/login-page-20261120-1012.
Devam edilsin mi? (e/H) e
  silindi  backup/login-page-20261120-1012  (b2c3d4e5f)

Geri almak için: git branch <ad> <sha>   (liste: /.../git-kit/session/removed-branches.log)
```

## Geri alma

```sh
cat <git-kit klasörü>/session/removed-branches.log
# 2026-11-20T12:08:16.016Z	feature/old-experiment	3f2a9c1e7b6d5a4f3e2d1c0b9a8f7e6d5c4b3a21

git branch feature/old-experiment 3f2a9c1e7b6d5a4f3e2d1c0b9a8f7e6d5c4b3a21
```

Sha'yı bilmek yeterlidir; git, erişilemeyen commit'leri uzun süre (`gc` budayana kadar, varsayılan olarak en az 2 hafta) saklar.

## Güvenlik

- Korumalı ve çıkışlı branch'ler `--force` ile bile silinmez.
- Commit kaybettiren silme yalnızca `--force` ile yapılır. `--only` ile kapsamı daraltmak mümkündür.
- Her silme log'a yazılır; geri dönüş tek satırdır.

## İlgili komutlar

- [`worktrees`](worktrees.md): bundan önce çalıştır.
- [`overview`](overview.md): neyin temizleneceğini görmeden önce genel tablo.
- [`rebase`](rebase.md): `backup/*` branch'lerini üretir.
