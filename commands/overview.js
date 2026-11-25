const path = require('path');
const lib = require('../lib');
const { git } = lib;

const usage = `git kit overview — repodaki tüm yerel branch'lerin durumunu tek tabloda gösterir

Ne işe yarar
  "Ne nerede?" sorusunu cevaplar; hiçbir şeyi değiştirmez. Her yerel branch için:
    Upstream   origin'deki karşılığına göre: güncel / ↑önde ↓geride / silinmiş / yok
    <base>     origin/<base>'e göre önde (↑) / geride (↓) commit sayısı (kolon adı base'in adıdır)
    Merged     origin/<base>'e merge edilmiş mi (commit'leri base'te mi)
    PR         branch'ten açtığın PR ve durumu: #42 open / draft / merged / closed
               (gh ile tek çağrı; gh yoksa ya da oturum açık değilse kolon gösterilmez)
    Son commit tarihi ve yazarı, çıkışlı olduğu worktree
  Altta stash ve worktree sayısı.

Ne zaman
  Temizlik komutlarından önce, bir repoya uzun aradan sonra döndüğünde, PR durumunu toparlarken.

Kullanım (reponun içinden)
  git kit overview [seçenekler]

Seçenekler
  --stale <gün>  son commit'i bu kadar günden eski branch'leri [ESKİ] ile işaretler
  --no-fetch     başta fetch yapmaz
  --no-pr        PR kolonunu atlar (gh çağrısı yapılmaz)

Base: repoda \`git config ${lib.BASE_CONFIG_KEY} <branch>\` ayarı varsa o, yoksa ${lib.DEFAULT_BASE}.

Örnek
  git kit overview --stale 30`;

function upstreamState(b) {
    let upstream = b.upstream;
    let suffix = '';
    // Upstream ayarlı değil ama origin'de aynı adla var (ör. tracking'siz açılmış main)
    if (!upstream && lib.refExists(`refs/remotes/${lib.REMOTE}/${b.name}`)) {
        upstream = `refs/remotes/${lib.REMOTE}/${b.name}`;
        suffix = ' (ayarsız)';
    }
    if (!upstream) return 'yok';
    if (b.track === '[gone]') return 'silinmiş';
    const { ahead, behind } = lib.aheadBehind(`refs/heads/${b.name}`, upstream);
    return (ahead || behind ? [ahead && `↑${ahead}`, behind && `↓${behind}`].filter(Boolean).join(' ') : 'güncel') + suffix;
}

async function main(options) {
    const staleDays = options.stale === undefined ? null : Number(options.stale);
    if (staleDays !== null && !(staleDays >= 0)) throw new Error(`--stale bir gün sayısı bekliyor: ${options.stale}`);

    lib.prepare(options);
    // gh çağrısı arka planda başlar, git sorgularıyla paralel ilerler
    const prsPromise = options.noPr ? Promise.resolve(null) : lib.myPullRequestsByBranch();

    const base = lib.base();
    const baseRef = lib.baseRef();
    const protectedSet = lib.protectedBranches();
    const hasBase = lib.refExists(`refs/remotes/${baseRef}`);
    const current = lib.currentBranch();
    const worktrees = lib.readWorktrees();
    const mainParent = path.dirname(worktrees[0].path);
    const wtOf = new Map(worktrees.filter(w => w.branch).map(w => [w.branch, w]));

    const branches = git([
        'for-each-ref', '--sort=-committerdate',
        '--format=%(refname:short)%00%(upstream)%00%(upstream:track)%00%(committerdate:unix)%00%(authorname)',
        'refs/heads'
    ])
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [name, upstream, track, date, author] = line.split('\0');
            return { name, upstream, track, date: parseInt(date, 10), author };
        });

    const prs = await prsPromise;
    const prColumn = branch => (prs ? [lib.prLabel(prs.get(branch))] : []);

    let staleCount = 0;
    const rows = branches.map(b => {
        const ref = `refs/heads/${b.name}`;
        let vsBase = '-';
        let merged = '-';
        if (hasBase && b.name !== base) {
            const { ahead, behind } = lib.aheadBehind(ref, baseRef);
            vsBase = `↑${ahead} ↓${behind}`;
            merged = ahead === 0 ? 'evet' : '';
        }
        const wt = wtOf.get(b.name);
        const wtText = !wt ? '' : wt === worktrees[0] ? '(ana)' : path.relative(mainParent, wt.path) + (wt.prunable ? ' (dizin yok)' : '');
        const stale = staleDays !== null && Date.now() / 1000 - b.date > staleDays * 86400;
        if (stale) staleCount++;

        const row = [b.name === current ? '*' : ' ', b.name, upstreamState(b), vsBase, merged, ...prColumn(b.name),
            lib.relativeTime(b.date), b.author, wtText];
        if (staleDays !== null) row.splice(1, 0, stale ? '[ESKİ]' : '');
        return row;
    });

    const headers = [' ', 'Branch', 'Upstream', base, 'Merged', ...(prs ? ['PR'] : []), 'Son commit', 'Yazar', 'Worktree'];
    if (staleDays !== null) headers.splice(1, 0, '');
    console.log('');
    lib.printTable(headers, rows);

    const stashCount = git(['stash', 'list']).split('\n').filter(Boolean).length;
    const mergedCol = headers.indexOf('Merged');
    const nameCol = headers.indexOf('Branch');
    const onRemote = lib.readRemoteBranches();
    const merged = rows.filter(r => r[mergedCol] === 'evet');
    const cleanable = merged.filter(r => !onRemote.has(r[nameCol]) && !protectedSet.has(r[nameCol])).length;
    console.log(`\n${branches.length} branch · ${merged.length} tanesi ${baseRef}'a merge edilmiş · ${worktrees.length - 1} ek worktree · ${stashCount} stash` +
        (staleDays !== null ? ` · ${staleCount} tanesi ${staleDays} günden eski` : ''));
    if (!hasBase) {
        console.log(`Not: ${baseRef} bulunamadı, ${base} karşılaştırması yapılmadı. ` +
            `Base farklıysa repoda bir kez: git config ${lib.BASE_CONFIG_KEY} <branch>`);
    }
    if (cleanable) console.log(`İpucu: merge edilmiş ve origin'de olmayan ${cleanable} branch \`git kit branches\` ile temizlenebilir.`);
}

module.exports = {
    name: 'overview',
    group: 'Durum / rapor',
    mode: 'salt okunur',
    summary: "Branch panosu: upstream/base farkı, merge, PR, yaş",
    usage,
    options: { flags: ['--no-fetch', '--no-pr'], values: ['--stale'] },
    main
};
