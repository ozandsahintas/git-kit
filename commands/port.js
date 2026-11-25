const crypto = require('crypto');
const os = require('os');
const path = require('path');
const lib = require('../lib');
const { git, errorText } = lib;

const usage = `git kit port — commit'leri başka bir branch'e taşır (mevcut çalışmana dokunmadan)

Ne işe yarar
  "Bu fix'i release/x'e / main'e de at" işini checkout yapmadan halleder: hedef branch'i geçici
  bir worktree'de açar, commit'leri \`cherry-pick -x\` ile uygular (mesaja kaynak sha eklenir),
  geçici worktree'yi siler. Senin çalışma ağacın, stash'in, açık değişikliklerin olduğu gibi kalır.

Adımlar
  1. fetch; commit'leri çözer (tekil sha/ref ya da a..b aralığı, merge commit'leri hariç)
  2. Hedef yerelde yoksa origin/<hedef>'ten oluşturulacağını, geride ise dur der
  3. Hedefte zaten olan (aynı patch) commit'leri [ATLA] ile işaretler
  4. Hedef bir worktree'de çıkışlıysa ve temizse orada, değilse geçici worktree'de cherry-pick
  5. Çakışmada worktree'yi bırakır ve nasıl devam edileceğini yazar
  6. --push verilirse hedefi origin'e gönderir

Kullanım (reponun içinden)
  git kit port <commit | a..b>... --to <branch> [seçenekler]

Seçenekler
  --to <branch>  hedef branch (zorunlu)
  (seçeneksiz)   kuru çalıştırma: ne taşınacağını listeler
  --apply        taşır (önce onay sorar)
  --yes          onay sormaz
  --push         başarılı olursa hedef branch'i origin'e push eder
  --no-fetch     başta fetch yapmaz

Örnekler
  git kit port a1b2c3d --to release/2.4 --apply
  git kit port HEAD~3..HEAD --to main --apply --push`;

function resolveCommits(args) {
    const shas = [];
    for (const arg of args) {
        if (arg.includes('..')) {
            const list = git(['rev-list', '--reverse', '--no-merges', arg]).split('\n').filter(Boolean);
            if (!list.length) throw new Error(`Aralık boş: ${arg}`);
            shas.push(...list);
        } else {
            const sha = lib.resolveCommit(arg);
            if (!sha) throw new Error(`Commit bulunamadı: ${arg}`);
            const parents = git(['rev-list', '--parents', '-n', '1', sha]).trim().split(' ').length - 1;
            if (parents > 1) throw new Error(`Merge commit taşınamaz: ${arg} (içindeki commit'leri a..b aralığıyla ver)`);
            shas.push(sha);
        }
    }
    return [...new Set(shas)];
}

// Hedefte aynı patch'e sahip commit var mı (veya commit zaten hedefin geçmişinde mi)
function alreadyIn(targetRef, sha) {
    if (lib.gitOk(['merge-base', '--is-ancestor', sha, targetRef])) return true;
    const parent = lib.resolveCommit(`${sha}^`);
    if (!parent) return false;
    const out = git(['cherry', targetRef, sha, parent]).trim();
    return out.startsWith('-');
}

function buildPlan(options) {
    const to = options.to;
    const plan = { to, create: false, workdir: null, temp: false, commits: [], blockers: [] };

    if (lib.refExists(`refs/heads/${to}`)) {
        plan.targetRef = `refs/heads/${to}`;
        const upstream = lib.gitTry(['rev-parse', '--symbolic-full-name', `${to}@{u}`]);
        if (upstream) {
            const { behind } = lib.aheadBehind(plan.targetRef, upstream);
            if (behind) plan.blockers.push(`${to}, upstream'inin ${behind} commit gerisinde — önce: git kit sync --apply`);
        }
    } else if (lib.refExists(`refs/remotes/${lib.REMOTE}/${to}`)) {
        plan.targetRef = `refs/remotes/${lib.REMOTE}/${to}`;
        plan.create = true;
    } else {
        throw new Error(`Hedef branch yok: ${to} (ne yerelde ne de ${lib.REMOTE}'de var)`);
    }

    const occupied = lib.readWorktrees().find(wt => wt.branch === to);
    if (occupied) {
        if (occupied.prunable) plan.blockers.push(`${to} dizini kaybolmuş bir worktree'de kayıtlı: ${occupied.path} (git kit worktrees)`);
        else if (lib.dirtyCount(occupied.path, false)) plan.blockers.push(`${to} şu worktree'de çıkışlı ve commit edilmemiş değişiklik var: ${occupied.path}`);
        plan.workdir = occupied.path;
    } else {
        plan.workdir = path.join(os.tmpdir(), `git-kit-port-${crypto.randomBytes(4).toString('hex')}`);
        plan.temp = true;
    }

    for (const sha of resolveCommits(options.positional)) {
        const subject = git(['log', '-1', '--format=%s', sha]).trim();
        const exists = alreadyIn(plan.targetRef, sha);
        plan.commits.push({ sha, subject, action: exists ? 'skip' : 'pick' });
    }
    return plan;
}

function printPlan(plan) {
    console.log(`\nHedef: ${plan.to}${plan.create ? `  (yerelde yok, ${lib.REMOTE}/${plan.to}'den oluşturulacak)` : ''}`);
    console.log(`Çalışma yeri: ${plan.temp ? 'geçici worktree (iş bitince silinir)' : `mevcut worktree ${plan.workdir}`}`);
    console.log(`\nCommit'ler (${plan.commits.length})`);
    for (const c of plan.commits) {
        console.log(`  ${c.action === 'pick' ? '[TAŞI] ' : '[ATLA] '}${c.sha.slice(0, 9)}  ${c.subject}${c.action === 'skip' ? '  — hedefte zaten var' : ''}`);
    }
    if (plan.blockers.length) {
        console.log('\nEngeller:');
        plan.blockers.forEach(b => console.log(`  ✗ ${b}`));
    }
}

function printConflictHelp(plan, failed, rest, applied) {
    console.error(`\nÇakışma: ${failed.sha.slice(0, 9)}  ${failed.subject}`);
    if (applied) console.error(`Ondan önceki ${applied} commit hedef branch'e (${plan.to}) uygulandı.`);
    console.error('Çalışma dizini bırakıldı:\n');
    console.error(`  cd "${plan.workdir}"`);
    console.error('  # çakışmaları çöz, git add <dosya>');
    console.error('  git cherry-pick --continue');
    if (rest.length) console.error(`  git cherry-pick -x ${rest.map(c => c.sha.slice(0, 9)).join(' ')}   # kalanlar`);
    console.error('\n  Vazgeçmek için: git cherry-pick --abort');
    if (plan.temp) console.error(`  İş bitince:     git worktree remove "${plan.workdir}"`);
}

async function main(options) {
    if (!options.to) throw new Error('--to <branch> zorunlu (yardım: git kit help port)');
    if (!options.positional.length) throw new Error('En az bir commit ver (yardım: git kit help port)');
    lib.prepare(options);

    const plan = buildPlan(options);
    printPlan(plan);

    const picks = plan.commits.filter(c => c.action === 'pick');
    console.log(`\nÖzet: ${picks.length} commit taşınacak; ${plan.commits.length - picks.length} atlandı.`);
    if (plan.blockers.length) {
        process.exitCode = 1;
        return;
    }
    if (!options.apply) {
        if (picks.length) console.log('Kuru çalıştırma — hiçbir şey değişmedi. Uygulamak için --apply ekle.');
        return;
    }
    if (!picks.length) return;
    if (!(await lib.confirm('\nDevam edilsin mi? (e/H) ', options))) {
        console.log('İptal edildi.');
        return;
    }

    if (plan.create) git(['branch', '--track', plan.to, `${lib.REMOTE}/${plan.to}`]);
    if (plan.temp) git(['worktree', 'add', '-q', plan.workdir, plan.to]);

    let applied = 0;
    for (const [index, c] of picks.entries()) {
        try {
            git(['-C', plan.workdir, 'cherry-pick', '-x', c.sha]);
            console.log(`  taşındı  ${c.sha.slice(0, 9)}  ${c.subject}`);
            applied++;
        } catch (error) {
            // Patch tespitinden kaçan, uygulandığında boş kalan commit
            if (/empty/i.test(errorText(error)) && lib.gitOk(['-C', plan.workdir, 'cherry-pick', '--skip'])) {
                console.log(`  atlandı  ${c.sha.slice(0, 9)}  ${c.subject}  (değişiklik zaten hedefte)`);
                continue;
            }
            printConflictHelp(plan, c, picks.slice(index + 1), applied);
            process.exitCode = 1;
            return;
        }
    }

    if (plan.temp) git(['worktree', 'remove', plan.workdir]);
    const head = git(['rev-parse', '--short', `refs/heads/${plan.to}`]).trim();
    console.log(`\n${plan.to} artık ${head}`);

    if (options.push) {
        const hasUpstream = lib.gitTry(['rev-parse', '--symbolic-full-name', `${plan.to}@{u}`]);
        git(['push', ...(hasUpstream ? [] : ['-u']), lib.REMOTE, plan.to], { stdio: 'inherit' });
    } else {
        console.log(`Push için: git push ${lib.REMOTE} ${plan.to}`);
    }
}

module.exports = {
    name: 'port',
    args: '<commit|a..b>... --to <branch>',
    group: 'Günlük akış',
    mode: 'kuru çalışır',
    summary: "Commit'leri checkout yapmadan başka branch'e taşır",
    usage,
    options: { flags: ['--apply', '--yes', '--push', '--no-fetch'], values: ['--to'], positional: true },
    main
};
