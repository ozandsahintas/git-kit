const lib = require('../lib');
const { git, errorText, realPath } = lib;

const usage = `git kit worktrees — ana worktree dışındaki worktree'leri temizler

Ne işe yarar
  Ana worktree dışındaki tüm worktree'leri (+ dizini kaybolmuş kayıtları) siler.
  Branch'lere dokunmaz; branch temizliği için bundan SONRA \`git kit branches\` çalıştır.

Kullanım (temizlenecek reponun içinden)
  git kit worktrees [seçenekler]

Seçenekler
  (seçeneksiz)  kuru çalıştırma: ne yapılacağını listeler, hiçbir şeyi silmez
  --apply       listelenenleri gerçekten siler (önce onay sorar)
  --yes         onay sormaz (etkileşimsiz ortam için)
  --force       commit edilmemiş değişikliği / benzersiz commit'i olan worktree'yi de siler
  --no-fetch    başta \`git fetch --prune\` yapmaz (offline; origin bilgisi eski kalabilir)

Her zaman atlananlar: ana worktree, içinde çalıştığın worktree, kilitli worktree.`;

const LABELS = { remove: '[SİL]  ', prune: '[SİL]  ', skip: '[ATLA] ' };

function buildPlan(options) {
    const worktrees = lib.readWorktrees();
    const top = lib.currentTopLevel();
    const branches = lib.readBranches();
    const kept = lib.keptBranches(branches, lib.readRemoteBranches());

    // İlk kayıt ana worktree'dir, dokunulmaz
    return worktrees.slice(1).map(wt => {
        const item = { wt, action: 'remove', reason: '' };
        const skip = reason => Object.assign(item, { action: 'skip', reason });

        if (realPath(wt.path) === top) return skip('şu an içinde çalıştığın worktree');
        if (wt.prunable) return Object.assign(item, { action: 'prune', reason: 'dizini yok, kaydı temizlenecek' });
        if (wt.locked) return skip('kilitli (git worktree unlock ile açabilirsin)');

        if (!options.force) {
            try {
                const dirty = lib.dirtyCount(wt.path);
                if (dirty > 0) return skip(`commit edilmemiş ${dirty} değişiklik var`);
                if (wt.detached) {
                    const unique = lib.uniqueCommits(wt.head, kept);
                    if (unique > 0) return skip(`detached HEAD'deki ${unique} commit başka hiçbir yerde yok`);
                }
            } catch (error) {
                return skip(`durumu okunamadı: ${errorText(error)}`);
            }
        }
        return item;
    });
}

function printPlan(plan) {
    console.log(`\nWorktree'ler (${plan.length})`);
    if (!plan.length) console.log('  (ana worktree dışında yok)');
    for (const { wt, action, reason } of plan) {
        const branch = wt.branch ? ` (${wt.branch})` : wt.detached ? ' (detached)' : '';
        console.log(`  ${LABELS[action]}${wt.path}${branch}${reason ? `  — ${reason}` : ''}`);
    }
}

function applyPlan(plan, options) {
    const failures = [];

    for (const { wt } of plan.filter(i => i.action === 'remove')) {
        try {
            git(['worktree', 'remove', ...(options.force ? ['--force'] : []), wt.path]);
            console.log(`  silindi  ${wt.path}`);
        } catch (error) {
            failures.push(`${wt.path}: ${errorText(error)}`);
        }
    }
    git(['worktree', 'prune']);
    lib.printFailures(failures);
}

async function main(options) {
    lib.prepare(options);

    const plan = buildPlan(options);
    printPlan(plan);

    const count = plan.filter(i => i.action !== 'skip').length;
    console.log(`\nÖzet: ${count} worktree silinecek; ${plan.length - count} atlandı.`);

    if (!options.apply) {
        console.log('Kuru çalıştırma — hiçbir şey silinmedi. Uygulamak için --apply ekle.');
        return;
    }
    if (!count) return;
    if (options.force) console.log('UYARI: --force açık, koruma kuralları devre dışı.');

    if (!(await lib.confirm('\nDevam edilsin mi? (e/H) ', options))) {
        console.log('İptal edildi.');
        return;
    }
    applyPlan(plan, options);
}

module.exports = {
    name: 'worktrees',
    group: 'Temizlik',
    mode: 'kuru çalışır',
    summary: "Ana worktree dışındaki worktree'leri siler",
    usage,
    options: { flags: ['--apply', '--yes', '--force', '--no-fetch'] },
    main
};
