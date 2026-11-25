const fs = require('fs');
const path = require('path');
const lib = require('../lib');
const { git } = lib;

const usage = `git kit rebase — yedek alarak güvenli rebase (varsayılan: origin/<base> üzerine)

Ne işe yarar
  Elle yaptığın "backup branch'i aç → rebase → kontrol et → force push" sırasını tek komutta,
  geri dönüşü her zaman tek satır olacak şekilde yapar.

Adımlar
  1. fetch; branch'in hedefe göre durumunu ve çakışma TAHMİNİNİ gösterir
     (git merge-tree ile, çalışma ağacına dokunmadan)
  2. Ön koşullar: detached değil, korumalı branch (develop/main/master/<base>) değil, izlenen dosyalarda
     değişiklik yok, yarım kalmış rebase/merge/cherry-pick yok
     origin'deki branch'te sende olmayan commit varsa (başkası push etmişse) uyarır; --push ile
     birlikte çalıştırmayı reddeder (force push o commit'leri silerdi)
  3. backup/<ad>-YYYYMMDD-HHmm yedeğini oluşturur
  4. git rebase <hedef>
       - çakışmada: devam / vazgeç / yedeğe tam dönüş komutlarını yazar
       - başarıda: git range-diff ile eski ve yeni commit'leri karşılaştırır
  5. --push: --force-with-lease ile (rebase öncesi görülen origin sha'sına kilitli) push eder;
     upstream yoksa push -u. Asla düz --force kullanmaz.

Kullanım (rebase edilecek branch'in içinden)
  git kit rebase [seçenekler]

Seçenekler
  (seçeneksiz)    kuru çalıştırma: durum + çakışma tahmini, hiçbir şeye dokunmaz
  --apply         yedek alıp rebase eder (önce onay sorar)
  --yes           onay sormaz
  --onto <ref>    hedef (varsayılan: origin/<base>)

Base: repoda \`git config ${lib.BASE_CONFIG_KEY} <branch>\` ayarı varsa o, yoksa ${lib.DEFAULT_BASE}.
  --push          başarılı rebase sonrası force-with-lease push
  --no-fetch      başta fetch yapmaz

Not: yedek branch eski commit'leri tuttuğu için \`git kit branches\` onu --force olmadan silmez.

Örnekler
  git kit rebase
  git kit rebase --apply --push
  git kit rebase --onto origin/release/2.4 --apply`;

function inProgressOperation() {
    const markers = { 'rebase-merge': 'rebase', 'rebase-apply': 'rebase/am', MERGE_HEAD: 'merge', CHERRY_PICK_HEAD: 'cherry-pick', REVERT_HEAD: 'revert' };
    for (const [file, label] of Object.entries(markers)) {
        const p = path.resolve(git(['rev-parse', '--git-path', file]).trim());
        if (fs.existsSync(p)) return label;
    }
    return null;
}

// Branch'in origin'deki karşılığı: { remote, ref (refs/heads/..), sha } veya null
function readUpstream(branch) {
    const [remote, ref] = git(['for-each-ref', '--format=%(upstream:remotename)%00%(upstream:remoteref)', `refs/heads/${branch}`]).trim().split('\0');
    if (!remote || !ref) return null;
    const sha = lib.gitTry(['rev-parse', '--verify', '-q', `${branch}@{u}`]);
    return { remote, ref, sha };
}

async function main(options) {
    lib.prepare(options);

    const branch = lib.currentBranch();
    if (!branch) throw new Error('Detached HEAD: rebase için bir branch üzerinde ol.');
    const target = options.onto || lib.baseRef();
    if (!lib.resolveCommit(target)) throw new Error(`Hedef bulunamadı: ${target}`);

    const { ahead, behind } = lib.aheadBehind('HEAD', target);
    console.log(`\nBranch: ${branch}`);
    console.log(`Hedef:  ${target}  (hedefte ${behind} yeni commit var, bu branch'teki ${ahead} commit yeniden uygulanacak)`);

    if (!behind) {
        console.log(`\nZaten güncel: ${target} bu branch'in içinde, rebase gerekmiyor.`);
        return;
    }

    const conflicts = lib.predictConflicts(target, 'HEAD');
    if (conflicts === null) console.log('Çakışma tahmini: git ≥ 2.38 gerekiyor, atlandı.');
    else if (!conflicts.length) console.log('Çakışma tahmini: çakışma beklenmiyor.');
    else {
        console.log(`Çakışma tahmini: ${conflicts.length} dosyada çakışma bekleniyor:`);
        conflicts.forEach(f => console.log(`  ! ${f}`));
    }

    // origin'deki branch'te, yerelde (rebase edilmiş kopyası olarak bile) bulunmayan commit'ler:
    // başkası push etmiş demektir; force push bunları origin'den siler. --force-with-lease bunu yakalamaz,
    // çünkü fetch'ten sonra lease sha'sı zaten bu commit'leri içerir.
    const upstream = readUpstream(branch);
    const foreign = upstream && upstream.sha
        ? git(['cherry', 'HEAD', upstream.sha]).split('\n').filter(line => line.startsWith('+')).length
        : 0;
    const foreignText = `${upstream ? upstream.ref.replace(/^refs\/heads\//, `${upstream.remote}/`) : ''} üzerinde yerelde olmayan ${foreign} commit var ` +
        `(başkası push etmiş olabilir); force push bunları siler. Önce al: git pull --rebase`;

    const blockers = [];
    if (foreign && options.push) blockers.push(foreignText);
    else if (foreign) console.log(`\nUyarı: ${foreignText}`);
    if (lib.protectedBranches().has(branch)) blockers.push(`${branch} korumalı branch; onu rebase etmek yerine \`git kit sync\` kullan`);
    const dirty = lib.dirtyCount(lib.currentTopLevel(), false);
    if (dirty) blockers.push(`izlenen dosyalarda ${dirty} commit edilmemiş değişiklik var (commit et ya da stash'le)`);
    const op = inProgressOperation();
    if (op) blockers.push(`yarım kalmış bir ${op} var`);
    if (blockers.length) {
        console.log('\nEngeller:');
        blockers.forEach(b => console.log(`  ✗ ${b}`));
        process.exitCode = 1;
        return;
    }

    if (!options.apply) {
        console.log('\nKuru çalıştırma — hiçbir şey değişmedi. Uygulamak için --apply ekle.');
        return;
    }
    if (!(await lib.confirm('\nYedek alınıp rebase edilsin mi? (e/H) ', options))) {
        console.log('İptal edildi.');
        return;
    }

    const backup = lib.createBackup(branch);
    console.log(`\nYedek: ${backup}`);

    try {
        git(['rebase', target], { stdio: 'inherit' });
    } catch {
        console.error('\nRebase çakışmayla durdu.');
        console.error('  Devam:          çakışmaları çöz → git add <dosya> → git rebase --continue');
        console.error('  Vazgeç:         git rebase --abort');
        console.error(`  Yedeğe dön:     git rebase --abort && git reset --hard ${backup}`);
        if (!foreign && upstream) console.error(`  Bitince push:   git push --force-with-lease ${upstream.remote} ${branch}`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nEski (${backup}) ve yeni commit'lerin karşılaştırması:`);
    try {
        git(['range-diff', target, backup, 'HEAD'], { stdio: 'inherit' });
    } catch {
        console.log('  (range-diff çalıştırılamadı)');
    }

    if (options.push) {
        console.log('');
        if (upstream && upstream.sha) {
            git(['push', `--force-with-lease=${upstream.ref}:${upstream.sha}`, upstream.remote, `HEAD:${upstream.ref}`], { stdio: 'inherit' });
        } else {
            git(['push', '-u', lib.REMOTE, branch], { stdio: 'inherit' });
        }
    } else if (foreign) {
        console.log(`\nPush ETME: ${foreignText}`);
    } else if (upstream) {
        console.log(`\nPush için: git push --force-with-lease ${upstream.remote} ${branch}`);
    }
    console.log(`Geri dönmek istersen: git reset --hard ${backup}`);
}

module.exports = {
    name: 'rebase',
    group: 'Günlük akış',
    mode: 'kuru çalışır',
    summary: "Yedek alıp base üzerine rebase, güvenli force push",
    usage,
    options: { flags: ['--apply', '--yes', '--push', '--no-fetch'], values: ['--onto'] },
    main
};
