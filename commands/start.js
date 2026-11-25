const fs = require('fs');
const path = require('path');
const lib = require('../lib');
const { git } = lib;

const usage = `git kit start — yeni işe origin/<base>'in en güncel hâlinden başlar

Ne işe yarar
  Yeni branch'i yerel (bayat olabilecek) base'ten değil, fetch edilmiş origin/<base>'ten açar.
  Branch \`--no-track\` ile açılır; böylece yanlışlıkla origin/<base>'i takip etmez, ilk push'ta
  kendi adıyla origin'e gider. İstersen ayrı bir worktree'de açar.
  Base: repoda \`git config ${lib.BASE_CONFIG_KEY} <branch>\` ayarı varsa o, yoksa ${lib.DEFAULT_BASE}.

Adımlar
  1. Ad içinde "/" yoksa feature/ öneki ekler, adı doğrular
  2. fetch; aynı adda yerel ya da origin branch'i varsa durur
  3a. (varsayılan) bulunduğun worktree'de yeni branch'e geçer; commit edilmemiş değişikliklerin
      varsa onları yeni branch'e taşıdığını söyler
  3b. --worktree: ../<repo>-<ad> klasöründe yeni worktree açar, bulunduğun yere dokunmaz
  4. --push: origin'e push edip upstream'i ayarlar

Kullanım (reponun içinden)
  git kit start <ad> [seçenekler]

Seçenekler
  --worktree     yeni branch'i ayrı bir worktree'de aç
  --from <ref>   taban (varsayılan: origin/<base>); ör. origin/main, origin/release/2.4
  --push         oluşturduktan sonra \`push -u origin <ad>\`
  --no-fetch     başta fetch yapmaz (taban eski kalabilir)

Örnekler
  git kit start user-export             → feature/user-export
  git kit start hotfix/date-format --from origin/main --worktree`;

async function main(options) {
    const input = options.positional[0];
    if (!input) throw new Error('Branch adı ver (yardım: git kit help start)');
    const name = input.includes('/') ? input : `feature/${input}`;
    if (!lib.gitOk(['check-ref-format', '--branch', name])) throw new Error(`Geçersiz branch adı: ${name}`);

    lib.prepare(options);

    if (lib.refExists(`refs/heads/${name}`)) throw new Error(`${name} yerelde zaten var (geçmek için: git switch ${name})`);
    if (lib.refExists(`refs/remotes/${lib.REMOTE}/${name}`)) {
        throw new Error(`${name} ${lib.REMOTE}'de zaten var (takip eden yerel branch için: git switch ${name})`);
    }

    const base = options.from || lib.baseRef();
    const baseSha = lib.resolveCommit(base);
    if (!baseSha) throw new Error(`Taban bulunamadı: ${base}`);
    const baseInfo = git(['log', '-1', '--format=%h %s', baseSha]).trim();

    let dir;
    if (options.worktree) {
        const mainPath = lib.readWorktrees()[0].path;
        dir = path.join(path.dirname(mainPath), `${path.basename(mainPath)}-${lib.shortName(name)}`);
        if (fs.existsSync(dir)) throw new Error(`Klasör zaten var: ${dir}`);
        git(['worktree', 'add', '-q', '--no-track', '-b', name, dir, base]);
    } else {
        dir = lib.currentTopLevel();
        const dirty = lib.dirtyCount(dir);
        git(['switch', '-q', '--no-track', '-c', name, base]);
        if (dirty) console.log(`Not: commit edilmemiş ${dirty} değişiklik yeni branch'e taşındı.`);
    }

    console.log(`\nOluşturuldu: ${name}  ←  ${base} (${baseInfo})`);
    if (options.worktree) console.log(`Worktree:    ${dir}`);

    if (options.push) {
        git(['-C', dir, 'push', '-q', '-u', lib.REMOTE, name], { stdio: 'inherit' });
        console.log(`Push edildi: ${lib.REMOTE}/${name} (upstream ayarlandı)`);
    }
    if (options.worktree) console.log(`\n  cd "${dir}"`);
}

module.exports = {
    name: 'start',
    args: '<ad>',
    group: 'Günlük akış',
    mode: 'doğrudan',
    summary: "origin/<base>'ten yeni branch açar (istersen worktree'de)",
    usage,
    options: { flags: ['--worktree', '--push', '--no-fetch'], values: ['--from'], positional: 1 },
    main
};
