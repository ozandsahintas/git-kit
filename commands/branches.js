const fs = require('fs');
const lib = require('../lib');
const { git, errorText, realPath } = lib;

const usage = `git kit branches — origin'de karşılığı olmayan yerel branch'leri temizler

Ne işe yarar
  origin'de karşılığı olmayan yerel branch'leri siler (backup/*, origin'den silinmiş "gitti" olanlar vb.).
  Commit'i başka hiçbir yerde olmayan branch'e dokunmaz (--force hariç).
  Worktree'de çıkışlı branch'ler atlanır; önce \`git kit worktrees\` çalıştır.

Kullanım (temizlenecek reponun içinden)
  git kit branches [seçenekler]

Seçenekler
  (seçeneksiz)  kuru çalıştırma: ne yapılacağını listeler, hiçbir şeyi silmez
  --apply       listelenenleri gerçekten siler (önce onay sorar)
  --yes         onay sormaz (etkileşimsiz ortam için)
  --force       origin'de / etiketlerde / korunan branch'lerde olmayan commit'i olan branch'i de siler
  --only <ad>   yalnızca bu branch'(ler)e bakar; virgülle birden fazla verilebilir.
                --force ile birlikte kullanınca zorla silme sadece bunlara uygulanır
  --no-fetch    başta \`git fetch --prune\` yapmaz (offline; origin bilgisi eski kalabilir)

Her zaman atlananlar: develop/main/master ve repo'nun base'i (git config ${lib.BASE_CONFIG_KEY}), bir worktree'de çıkışlı branch.
Silinen her branch'in sha'sı git kit klasöründeki session/removed-branches.log dosyasına yazılır
(geri almak için: git branch <ad> <sha>).

Örnekler
  git kit branches
  git kit branches --apply
  git kit branches --only feature/old-experiment --force --apply`;

const LABELS = { delete: '[SİL]  ', skip: '[ATLA] ' };

// --only a,b → Set; adlar yerelde olmalı ve origin'de karşılığı olmamalı
function readOnly(options, branches, onRemote) {
    if (options.only === undefined) return null;
    const names = new Set(options.only.split(',').map(n => n.trim()).filter(Boolean));
    const local = new Set(branches.map(b => b.name));
    const problems = [];
    for (const name of names) {
        if (!local.has(name)) problems.push(`${name}: yerelde böyle bir branch yok`);
        else if (onRemote.has(name)) problems.push(`${name}: ${lib.REMOTE}'de karşılığı var, bu komut ona dokunmaz`);
    }
    if (problems.length) throw new Error(`--only:\n  ${problems.join('\n  ')}`);
    return names;
}

function buildPlan(options) {
    const worktrees = lib.readWorktrees();
    const top = lib.currentTopLevel();
    const branches = lib.readBranches();
    const onRemote = lib.readRemoteBranches();
    const kept = lib.keptBranches(branches, onRemote);
    const protectedSet = lib.protectedBranches();
    const only = readOnly(options, branches, onRemote);

    // Çıkışlı branch'ler: yol + `git kit worktrees` ile kurtarılabilir mi (ana/geçerli worktree değilse evet)
    const occupied = new Map();
    worktrees.forEach((wt, index) => {
        if (wt.branch) occupied.set(wt.branch, { path: wt.path, removable: index > 0 && realPath(wt.path) !== top });
    });

    return branches
        .filter(b => !onRemote.has(b.name) && (!only || only.has(b.name)))
        .map(b => {
            const item = { ...b, action: 'delete', reason: '' };
            const skip = reason => Object.assign(item, { action: 'skip', reason });

            if (protectedSet.has(b.name)) return skip('korumalı branch');

            const wt = occupied.get(b.name);
            if (wt) return skip(`çıkışlı: ${wt.path}${wt.removable ? ' (önce git kit worktrees çalıştır)' : ''}`);

            const unique = lib.uniqueCommits(`refs/heads/${b.name}`, kept);
            if (unique > 0) {
                if (!options.force) return skip(`${unique} commit origin'de, etiketlerde ve korunan branch'lerde yok`);
                item.reason = `--force: ${unique} benzersiz commit kaybolacak`;
            }
            return item;
        });
}

function printPlan(plan, options) {
    console.log(`\nOrigin'de olmayan yerel branch'ler${options.only !== undefined ? ' (--only)' : ''} (${plan.length})`);
    if (!plan.length) console.log('  (yok)');
    for (const { name, sha, subject, action, reason } of plan) {
        const detail = action === 'skip' ? `— ${reason}` : `${sha.slice(0, 9)}  ${subject}${reason ? `  (${reason})` : ''}`;
        console.log(`  ${LABELS[action]}${name}  ${detail}`);
    }
}

function applyPlan(plan) {
    const failures = [];
    let deleted = 0;

    for (const b of plan.filter(i => i.action === 'delete')) {
        try {
            git(['branch', '-D', b.name]);
            lib.sessionDir(); // session/ yoksa oluştur
            fs.appendFileSync(lib.LOG_FILE, `${new Date().toISOString()}\t${b.name}\t${b.sha}\n`);
            deleted++;
            console.log(`  silindi  ${b.name}  (${b.sha.slice(0, 9)})`);
        } catch (error) {
            failures.push(`${b.name}: ${errorText(error)}`);
        }
    }

    if (deleted) {
        console.log(`\nGeri almak için: git branch <ad> <sha>   (liste: ${lib.LOG_FILE})`);
    }
    lib.printFailures(failures);
}

async function main(options) {
    lib.prepare(options);

    const plan = buildPlan(options);
    printPlan(plan, options);

    const count = plan.filter(i => i.action === 'delete').length;
    console.log(`\nÖzet: ${count} branch silinecek; ${plan.length - count} atlandı.`);

    if (!options.apply) {
        console.log('Kuru çalıştırma — hiçbir şey silinmedi. Uygulamak için --apply ekle.');
        return;
    }
    if (!count) return;
    if (options.force) {
        console.log(`UYARI: --force açık, koruma kuralları ${options.only !== undefined ? `yalnızca şunlar için devre dışı: ${options.only}` : 'TÜM listelenen branch\'ler için devre dışı'}.`);
    }

    if (!(await lib.confirm('\nDevam edilsin mi? (e/H) ', options))) {
        console.log('İptal edildi.');
        return;
    }
    applyPlan(plan);
}

module.exports = {
    name: 'branches',
    group: 'Temizlik',
    mode: 'kuru çalışır',
    summary: "origin'de olmayan yerel branch'leri siler (log'lu)",
    usage,
    options: { flags: ['--apply', '--yes', '--force', '--no-fetch'], values: ['--only'] },
    main
};
