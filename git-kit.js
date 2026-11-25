#!/usr/bin/env node
const lib = require('./lib');

// Sıra = help'teki sıra
const COMMANDS = [
    'start', 'sync', 'rebase', 'port', 'stash-apply',
    'overview', 'repos-status', 'prs',
    'worktrees', 'branches', 'stash-export'
].map(name => require(`./commands/${name}`));

const GROUPS = ['Günlük akış', 'Durum / rapor', 'Temizlik'];

function generalHelp() {
    const label = c => `${c.name}${c.args ? ` ${c.args}` : ''}`;
    const width = 28; // bundan uzun etiketler kendi satırında, açıklama alt satırda
    const modeWidth = Math.max(...COMMANDS.map(c => c.mode.length)) + 2;

    const groups = GROUPS.map(group => {
        const lines = COMMANDS.filter(c => c.group === group).map(c => {
            const text = `${`[${c.mode}]`.padEnd(modeWidth)}  ${c.summary}`;
            return label(c).length > width
                ? `  ${label(c)}\n  ${''.padEnd(width)}  ${text}`
                : `  ${label(c).padEnd(width)}  ${text}`;
        });
        return `${group}\n${lines.join('\n')}`;
    });

    return `git kit — günlük git akışı için küçük, kontrollü komutlar

Kullanım
  git kit <komut> [seçenekler]
  git kit help <komut>        komutun ne yaptığı, adımları, seçenekleri ve örnekleri
  git kit <komut> -h          (aynısı)

${groups.join('\n\n')}

Çalışma kipleri
  [kuru çalışır]  seçeneksiz çalıştırınca sadece ne yapılacağını listeler; --apply ile uygular
                  ve önce onay sorar (--yes onayı atlar)
  [salt okunur]   sadece rapor verir, hiçbir şeyi değiştirmez
  [doğrudan]      yalnızca ekleme yapar (branch / worktree / dosya oluşturur), hemen çalışır

Ortak seçenekler
  --apply       listelenenleri uygular (önce onay sorar)
  --yes         onay sormaz (etkileşimsiz ortam için)
  --no-fetch    başta \`git fetch --prune origin\` yapmaz (offline)
  --push        iş bitince sonucu origin'e gönderir (asla varsayılan değil)
  --force       koruma kurallarını kapatır; önce --force ile kuru çalıştırıp listeyi gör
  --no-pr       PR kolonunu atlar (gh çağrılmaz)

Base branch (repo başına)
  start/rebase'in varsayılan tabanı ve overview karşılaştırması origin/<base>'tir.
  Base: \`git config ${lib.BASE_CONFIG_KEY} <branch>\` ayarı varsa o, yoksa ${lib.DEFAULT_BASE}.
  Ayarlamak: git config ${lib.BASE_CONFIG_KEY} <branch>   Kaldırmak: git config --unset ${lib.BASE_CONFIG_KEY}

Önerilen akışlar
  Sabah            git kit sync --apply   →   git kit overview
  Yeni iş          git kit start <ad> --worktree
  PR öncesi        git kit rebase   →   git kit rebase --apply --push
  Fix'i taşı       git kit port <commit> --to <branch> --apply --push
  Stash'i geri al  git kit stash-apply   →   git kit stash-apply --apply
  Temizlik         git kit worktrees --apply   →   git kit branches --apply
  Gün sonu         git kit repos-status

Kurulum: bu klasörde bir kez \`npm link\` → \`git kit\` her repoda çalışır.
Not: \`git kit --help\` git'in man sayfasını arar; yardım için \`git kit help\` ya da \`git kit -h\` kullan.`;
}

function distance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
    }
    return dp[a.length][b.length];
}

function findCommand(name) {
    const command = COMMANDS.find(c => c.name === name);
    if (command) return command;

    const guess = COMMANDS
        .map(c => ({ c, d: c.name.startsWith(name) ? 0 : distance(name, c.name) }))
        .sort((x, y) => x.d - y.d)[0];
    const hint = guess && guess.d <= 3 ? `Bunu mu demek istedin: git kit ${guess.c.name}\n` : '';
    console.error(`Bilinmeyen komut: ${name}\n${hint}Komut listesi için: git kit help`);
    process.exit(1);
}

const isHelp = arg => arg === 'help' || arg === '-h' || arg === '--help';
const [name, ...rest] = process.argv.slice(2);

if (!name || isHelp(name)) {
    console.log(rest[0] ? findCommand(rest[0]).usage : generalHelp());
} else {
    const command = findCommand(name);
    if (rest.some(arg => arg === '-h' || arg === '--help')) {
        console.log(command.usage);
    } else {
        lib.run(async () => command.main(lib.parseOptions(`Yardım: git kit help ${command.name}`, command.options, rest)));
    }
}
