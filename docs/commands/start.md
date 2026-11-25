# git kit start

> **Kip: [doğrudan]** · Grup: Günlük akış · Kaynak: [`commands/start.js`](../../commands/start.js)

Yeni işe `origin/<base>`'in **en güncel** hâlinden başlar. Base varsayılan olarak `develop`'tır; repo başına `git config kit.base <branch>` ile değiştirilir ([README › Base branch](../../README.md#base-branch-repo-başına-ayar)). İstersen yeni branch'i ayrı bir worktree'de açar.

## Ne işe yarar

Yerel base branch'i çoğu zaman bayattır. Ondan branch açınca daha ilk günden geride başlarsın. `start` önce fetch yapar, branch'i doğrudan `origin/<base>`'ten açar.

Branch `--no-track` ile açılır. Böylece yanlışlıkla `origin/<base>`'i takip etmez; ilk push'ta kendi adıyla origin'e gider. `git push` yanlışlıkla base'e gitmez.

## Ne zaman

- Yeni bir task'a başlarken.
- Mevcut çalışmanı bozmadan paralel bir iş açmak istediğinde (`--worktree`).
- Hotfix'i `main` ya da bir release branch'inden açarken (`--from`).

## Kullanım

```sh
git kit start <ad> [seçenekler]
```

Reponun içinden çalıştırılır. Ad içinde `/` yoksa başına `feature/` eklenir:

| Verilen | Oluşan branch |
|---|---|
| `login-page` | `feature/login-page` |
| `fix/null-check` | `fix/null-check` |
| `hotfix/date-format` | `hotfix/date-format` |

## Seçenekler

> [!IMPORTANT]
> **Ortak seçenekler:** `start` [doğrudan] kiptedir. Yalnızca **ekleme** yapar (yeni branch, istenirse yeni worktree), mevcut hiçbir şeyi silmez ya da değiştirmez. Bu yüzden **`--apply` ve `--yes` almaz**, onay sormadan hemen çalışır. Ortak seçeneklerden `--no-fetch` ve `--push`'u destekler. Ayrıntı: [README › Ortak seçenekler](../../README.md#ortak-seçenekler)

| Seçenek | Ortak mı | Açıklama |
|---|:-:|---|
| `--worktree` | | Branch'i ayrı bir worktree'de açar: `../<repo>-<kısa-ad>`. Bulunduğun worktree'ye dokunmaz. |
| `--from <ref>` | | Taban. Varsayılan: `origin/<base>` (base ayarı yoksa `origin/develop`). Ör. `origin/main`, `origin/release/2.4`. |
| `--push` | ✓ | Oluşturduktan sonra `git push -u origin <ad>` yapar, upstream ayarlanır. |
| `--no-fetch` | ✓ | Başta fetch yapmaz. Taban eski kalabilir. |

### Worktree klasör adı

`--worktree` ile açılan klasörün adı `<repo>-<kısa-ad>` olur. Kısa ad, branch adından bilinen önek atılıp kalan `/` işaretleri `-` yapılarak üretilir.

Atılan önekler: `feature`, `feat`, `fix`, `bugfix`, `hotfix`, `refactor`, `chore`, `docs`, `test`, `release`, `backup`.

| Branch | Worktree klasörü |
|---|---|
| `feature/login-page` | `../my-app-login-page` |
| `fix/null-check` | `../my-app-null-check` |
| `refactor/a/b` | `../my-app-a-b` |
| `ozel/deneme` | `../my-app-ozel-deneme` (önek listede yok, korunur) |

## Nasıl çalışır

1. Adı tamamlar (`/` yoksa `feature/` ekler) ve `git check-ref-format` ile doğrular.
2. `git fetch --prune origin`. Aynı adda yerel ya da origin branch'i varsa durur.
3. Tabanı (`--from` ya da `origin/<base>`) çözer, bulunamazsa durur.
4. Branch'i açar:
   - **Varsayılan:** bulunduğun worktree'de `git switch --no-track -c <ad> <taban>`. Commit edilmemiş değişikliklerin yeni branch'e taşınır ve bu sana söylenir.
   - **`--worktree`:** `git worktree add --no-track -b <ad> <klasör> <taban>`. Klasör zaten varsa durur.
5. `--push` verildiyse `push -u origin <ad>`.

## Örnek

```sh
git kit start login-page --worktree
```

```
git fetch --prune origin ...

Oluşturuldu: feature/login-page  ←  origin/develop (a1b2c3d4e chore: bağımlılıkları güncelle)
Worktree:    /Users/ben/Documents/GitHub/my-app-login-page

  cd "/Users/ben/Documents/GitHub/my-app-login-page"
```

Diğer örnekler:

```sh
git kit start fix/null-check                               # bulunduğun yerde, origin/<base>'ten
git kit start hotfix/date-format --from origin/main --worktree
git kit start login-page --push                            # açıp hemen origin'e gönder
```

## Sık karşılaşılan durumlar

| Mesaj | Anlamı / çözüm |
|---|---|
| `feature/x yerelde zaten var` | Bu adda branch var. Geçmek için `git switch feature/x`. |
| `feature/x origin'de zaten var` | Başkası ya da sen başka makinede açmışsın. Takip eden yerel branch için `git switch feature/x`. |
| `Klasör zaten var: ...` | Aynı kısa ada düşen bir worktree klasörü var, ör. `fix/x` ile `feature/x`. Klasörü kaldır ya da farklı ad ver. |
| `Taban bulunamadı: origin/develop` | Repoda base branch yok (base ayarı yoksa `develop` aranır). Kalıcı çözüm: `git config kit.base main`; tek seferlik: `--from origin/main`. |
| `Not: commit edilmemiş N değişiklik yeni branch'e taşındı.` | Bilgi mesajı. Değişikliklerin kaybolmadı, yeni branch'te duruyor. |

## İlgili komutlar

- [`worktrees`](worktrees.md): iş bitince worktree'leri temizler.
- [`rebase`](rebase.md): branch'i PR öncesi güncel base üzerine taşır.
