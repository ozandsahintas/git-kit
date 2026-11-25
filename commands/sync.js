const path = require('path');
const lib = require('../lib');
const { git, errorText } = lib;

const usage = `git kit sync — yerel branch'leri origin'e fast-forward eder

Ne işe yarar
  \`git fetch\` yalnızca origin/* referanslarını günceller; yerel develop, main ve takip ettiğin
  feature branch'ler geride kalır. Bu komut upstream'inin GERİSİNDE kalan yerel branch'leri
  fast-forward eder. Asla merge commit'i oluşturmaz, rebase yapmaz, commit kaybettirmez.

Ne zaman
  Güne başlarken, branch açmadan / rebase yapmadan önce.

Adımlar
  1. git fetch --prune origin
  2. Upstream'i origin'de olan (upstream ayarlı değilse origin'de aynı adla duran) her yerel
     branch için önde/geride sayısını hesaplar
  3. Yalnızca geride olanları ilerletir:
       - bir worktree'de çıkışlıysa ve izlenen dosyalarda değişiklik yoksa orada \`merge --ff-only\`
       - çıkışlı değilse ref'i doğrudan (atomik) günceller
  4. Ayrışmış, push edilmemiş commit'i olan, upstream'i silinmiş veya kirli worktree'deki
     branch'leri gerekçesiyle [ATLA] olarak listeler

Kullanım (reponun içinden)
  git kit sync [seçenekler]

Seçenekler
  (seçeneksiz)  kuru çalıştırma: ne yapılacağını listeler, hiçbir şeye dokunmaz
  --apply       listelenenleri ilerletir (önce onay sorar)
  --yes         onay sormaz
  --no-fetch    başta fetch yapmaz

Örnek
  git kit sync --apply`;

const LABELS = { ff: '[FF]   ', skip: '[ATLA] ' };

function readTracked() {
    return git(['for-each-ref', '--format=%(refname:short)%00%(objectname)%00%(upstream)%00%(upstream:short)%00%(upstream:track)', 'refs/heads'])
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [name, sha, upstream, upstreamShort, track] = line.split('\0');
            return { name, sha, upstream, upstreamShort, track };
        });
}

function buildPlan() {
    const all = lib.readWorktrees();
    const parent = path.dirname(all[0].path);
    const worktrees = new Map();
    for (const wt of all) if (wt.branch) worktrees.set(wt.branch, { ...wt, label: wt === all[0] ? 'ana' : path.relative(parent, wt.path) });

    const stats = { noUpstream: 0, upToDate: 0 };
    const plan = [];

    for (const b of readTracked()) {
        // Upstream ayarlı değilse origin'deki aynı adlı branch kullanılır (ör. tracking'siz açılmış main).
        // Upstream'i yerel bir branch olanlar (ör. develop'u takip eden) kapsam dışı.
        let implicit = false;
        if (!b.upstream && lib.refExists(`refs/remotes/${lib.REMOTE}/${b.name}`)) {
            Object.assign(b, { upstream: `refs/remotes/${lib.REMOTE}/${b.name}`, upstreamShort: `${lib.REMOTE}/${b.name}` });
            implicit = true;
        }
        if (!b.upstream.startsWith('refs/remotes/')) {
            stats.noUpstream++;
            continue;
        }
        const item = { ...b, action: 'ff', reason: '', implicit, wt: worktrees.get(b.name) };
        const skip = reason => plan.push(Object.assign(item, { action: 'skip', reason }));

        if (b.track === '[gone]') {
            skip(`${b.upstreamShort} silinmiş (temizlik: git kit branches)`);
            continue;
        }

        const { ahead, behind } = lib.aheadBehind(`refs/heads/${b.name}`, b.upstream);
        if (!behind) {
            if (ahead) skip(`push edilmemiş ${ahead} commit var`);
            else stats.upToDate++;
            continue;
        }
        if (ahead) {
            skip(`ayrışmış: ${ahead} önde, ${behind} geride (git kit rebase)`);
            continue;
        }

        item.behind = behind;
        item.target = git(['rev-parse', b.upstream]).trim();
        if (item.wt) {
            if (item.wt.prunable) {
                skip(`worktree dizini yok: ${item.wt.path} (git kit worktrees)`);
                continue;
            }
            const dirty = lib.dirtyCount(item.wt.path, false);
            if (dirty) {
                skip(`çıkışlı olduğu worktree'de ${dirty} commit edilmemiş değişiklik var: ${item.wt.label}`);
                continue;
            }
        }
        plan.push(item);
    }
    return { plan, stats };
}

function printPlan(plan) {
    console.log(`\nİlerletilecek / atlanan branch'ler (${plan.length})`);
    if (!plan.length) console.log('  (yok)');
    for (const b of plan) {
        const detail = b.action === 'ff'
            ? `${b.behind} commit  ${b.sha.slice(0, 9)} → ${b.target.slice(0, 9)}` +
              (b.wt ? `  (worktree: ${b.wt.label})` : '') +
              (b.implicit ? `  (upstream ayarlı değil, ${b.upstreamShort} kullanıldı)` : '')
            : `— ${b.reason}`;
        console.log(`  ${LABELS[b.action]}${b.name}  ${detail}`);
    }
}

function applyPlan(plan) {
    const failures = [];
    for (const b of plan.filter(i => i.action === 'ff')) {
        try {
            if (b.wt) {
                git(['-C', b.wt.path, 'merge', '--ff-only', '-q', b.upstream]);
            } else {
                if (!lib.gitOk(['merge-base', '--is-ancestor', b.sha, b.target])) throw new Error('fast-forward değil');
                // Eski sha verildiği için arada ref değiştiyse güncelleme reddedilir
                git(['update-ref', '-m', 'git kit sync: fast-forward', `refs/heads/${b.name}`, b.target, b.sha]);
            }
            console.log(`  ilerletildi  ${b.name}  (+${b.behind})`);
        } catch (error) {
            failures.push(`${b.name}: ${errorText(error)}`);
        }
    }
    lib.printFailures(failures);
}

async function main(options) {
    lib.prepare(options);

    const { plan, stats } = buildPlan();
    printPlan(plan);

    const count = plan.filter(i => i.action === 'ff').length;
    console.log(`\nÖzet: ${count} branch ilerletilecek; ${plan.length - count} atlandı; ${stats.upToDate} güncel; ${stats.noUpstream} branch'in origin'de upstream'i yok.`);

    if (!options.apply) {
        if (count) console.log('Kuru çalıştırma — hiçbir şey değişmedi. Uygulamak için --apply ekle.');
        return;
    }
    if (!count) return;
    if (!(await lib.confirm('\nDevam edilsin mi? (e/H) ', options))) {
        console.log('İptal edildi.');
        return;
    }
    applyPlan(plan);
}

module.exports = {
    name: 'sync',
    group: 'Günlük akış',
    mode: 'kuru çalışır',
    summary: "Geride kalan yerel branch'leri origin'e fast-forward eder",
    usage,
    options: { flags: ['--apply', '--yes', '--no-fetch'] },
    main
};
