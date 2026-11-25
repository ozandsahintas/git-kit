const fs = require('fs');
const path = require('path');
const lib = require('../lib');
const { git, errorText } = lib;

const usage = `git kit stash-apply — stash'i, diskte zaten duran untracked dosyalara takılmadan uygular

Ne işe yarar
  \`git stash apply\`, stash'in geri yazacağı bir dosya çalışma ağacında untracked olarak zaten
  duruyorsa ("izlenmeyen çalışma ağacı dosyalarının üzerine yazılacak" / "already exists") tümden durur.
  Bu komut o dosyaları stash'teki hâliyle karşılaştırır:
    birebir aynı  → diskteki kopya kaldırılır, dosya stash'ten aynı içerikle geri gelir
    farklı        → varsayılan olarak hiçbir şey uygulanmaz, liste verilir;
                    --prefer-stash ile diskteki kopya yedeklenip stash'teki hâli alınır
  Stash \`pop\` değil \`apply\` ile uygulanır; stash listede kalır.

Kullanım (reponun içinden)
  git kit stash-apply [stash] [seçenekler]

  stash   varsayılan: stash@{0}   (liste: git stash list)

Seçenekler
  (seçeneksiz)    kuru çalıştırma: çakışan dosyaları ve ne yapılacağını listeler, hiçbir şeye dokunmaz
  --apply         uygular (önce onay sorar)
  --yes           onay sormaz (etkileşimsiz ortam için)
  --prefer-stash  içeriği farklı dosyalarda da stash'teki hâli alır (disktekiler yedeklenir)

Yedek
  Kaldırılan her dosya önce git kit klasöründeki session/stash-backups/<repo>-<tarih>/ altına kopyalanır.
  \`git stash apply\` başarısız olursa yerinde olmayan dosyalar yedekten geri konur.

Kapsam dışı
  İzlenen (tracked) dosyalardaki yerel değişikliklerle çakışma: git'in kendi hatası gösterilir.

Örnekler
  git kit stash-apply
  git kit stash-apply stash@{1} --apply
  git kit stash-apply --apply --prefer-stash`;

const LABELS = { same: '[AYNI]  ', replace: '[STASH] ', skip: '[DUR]   ' };

// -z: yollar tırnaksız/escape'siz gelir (boşluk ve Türkçe karakter sorunsuz)
function listFiles(args) {
    return git(args).split('\0').filter(Boolean);
}

// apply'ın çalışma ağacına yazacağı dosyalar → stash'teki nesnesi
function stashFiles(stash) {
    const files = new Map();
    // Tracked kısım: stash'in tabanı (^1) ile stash'lenen çalışma ağacı arası, silinenler hariç
    for (const file of listFiles(['diff', '--name-only', '-z', '--no-renames', '--diff-filter=d', `${stash}^1`, stash])) {
        files.set(file, `${stash}:${file}`);
    }
    // `git stash -u` ile alınmışsa untracked dosyalar ^3 commit'indedir
    if (lib.resolveCommit(`${stash}^3`)) {
        for (const file of listFiles(['ls-tree', '-r', '-z', '--name-only', `${stash}^3`])) {
            files.set(file, `${stash}^3:${file}`);
        }
    }
    return files;
}

function buildPlan(stash, options) {
    const tracked = new Set(listFiles(['ls-files', '-z']));
    const stashTime = parseInt(git(['log', '-1', '--format=%ct', stash]).trim(), 10);
    const plan = [];

    for (const [file, object] of stashFiles(stash)) {
        if (tracked.has(file)) continue; // tracked çakışmalar git'in işi
        let stat;
        try {
            stat = fs.lstatSync(file);
        } catch {
            continue; // diskte yok, çakışma yok
        }

        if (!stat.isFile()) {
            plan.push({ file, object, action: 'skip', reason: 'diskte normal dosya değil (klasör/link), elle çöz' });
            continue;
        }
        if (git(['hash-object', '--', file]).trim() === git(['rev-parse', object]).trim()) {
            plan.push({ file, object, action: 'same', reason: '' });
            continue;
        }

        const newer = stat.mtimeMs / 1000 > stashTime ? 'disk daha yeni' : 'stash daha yeni';
        const reason = `içerik farklı — disk ${lib.relativeTime(stat.mtimeMs / 1000)}, stash ${lib.relativeTime(stashTime)} (${newer})`;
        plan.push({ file, object, action: options.preferStash ? 'replace' : 'skip', reason });
    }
    return plan;
}

function printPlan(stash, plan) {
    console.log(`\n${stash}: diskte untracked olarak zaten duran dosyalar (${plan.length})`);
    if (!plan.length) console.log('  (yok)');
    for (const { file, action, reason } of plan) {
        console.log(`  ${LABELS[action]}${file}${reason ? `  — ${reason}` : ''}`);
    }
}

// <kit>/session/stash-backups/<repo>-<YYYYMMDD-HHmmss>
function backupDir() {
    return lib.sessionDir('stash-backups', `${lib.repoName()}-${lib.timestamp()}`);
}

function copyFile(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    fs.chmodSync(to, fs.statSync(from).mode);
}

function applyPlan(stash, plan) {
    const removed = plan.filter(i => i.action !== 'skip');
    const dir = removed.length ? backupDir() : null;

    for (const { file } of removed) {
        copyFile(file, path.join(dir, file));
        fs.unlinkSync(file);
    }
    if (dir) console.log(`  ${removed.length} dosya yedeklenip kaldırıldı: ${dir}`);

    try {
        const out = git(['stash', 'apply', stash]);
        console.log(`  git stash apply ${stash} — tamam`);
        if (out.trim()) console.log(out.trimEnd().replace(/^/gm, '    '));
    } catch (error) {
        // Yalnızca yerinde olmayanları geri koy; git'in yazdıklarına dokunma
        const restored = removed.filter(({ file }) => !fs.existsSync(file));
        restored.forEach(({ file }) => copyFile(path.join(dir, file), file));
        const stdout = error.stdout ? error.stdout.toString().trim() : '';
        throw new Error(
            `git stash apply başarısız:\n${[errorText(error), stdout].filter(Boolean).join('\n')}\n` +
            `${restored.length} dosya yedekten geri kondu.${dir ? ` Yedek: ${dir}` : ''}`
        );
    }

    // Kaldırılan dosyalar artık stash'teki içerikte olmalı
    const mismatched = removed.filter(({ file, object }) =>
        !fs.existsSync(file) || git(['hash-object', '--', file]).trim() !== git(['rev-parse', object]).trim());
    if (mismatched.length) {
        lib.printFailures(mismatched.map(({ file }) => `${file}: stash'teki içerikle eşleşmiyor, yedeğe bak (${dir})`));
    } else if (removed.length) {
        console.log(`  Doğrulandı: ${removed.length} dosya stash'teki içerikle birebir aynı.`);
    }
    console.log(`\nStash listede duruyor; artık gerekmiyorsa: git stash drop ${stash}`);
}

async function main(options) {
    const stash = options.positional[0] || 'stash@{0}';
    git(['rev-parse', '--git-dir']); // git reposu değilse burada hata verir
    // Sorgular SHA ile yapılır: `stash@{0}^3^{commit}`, 3. ebeveyn yokken bile stash'in kendisine çözülüyor (git 2.56)
    const sha = lib.resolveCommit(stash);
    if (!sha || !lib.resolveCommit(`${sha}^2`)) {
        throw new Error(`Stash bulunamadı: ${stash} (liste: git stash list)`);
    }
    // Stash yolları repo köküne göredir
    process.chdir(lib.currentTopLevel());

    const plan = buildPlan(sha, options);
    printPlan(stash, plan);

    const count = action => plan.filter(i => i.action === action).length;
    const blocked = count('skip');
    console.log(`\nÖzet: ${count('same')} aynı (diskteki kaldırılır, stash'ten gelir); ` +
        `${count('replace')} farklı, stash'teki alınır; ${blocked} engel.`);

    if (blocked) {
        console.log('Engel var — hiçbir şey uygulanmadı. İçeriği farklı dosyalar için --prefer-stash ver ' +
            '(disktekiler yedeklenir) ya da o dosyaları elle taşı.');
        process.exitCode = 1;
        return;
    }
    if (!options.apply) {
        console.log('Kuru çalıştırma — hiçbir şeye dokunulmadı. Uygulamak için --apply ekle.');
        return;
    }
    if (!(await lib.confirm(`\n${stash} uygulansın mı? (e/H) `, options))) {
        console.log('İptal edildi.');
        return;
    }
    applyPlan(stash, plan);
}

module.exports = {
    name: 'stash-apply',
    args: '[stash]',
    group: 'Günlük akış',
    mode: 'kuru çalışır',
    summary: "Stash'i uygular; diskte birebir aynı duran untracked dosyalara takılmaz",
    usage,
    options: { flags: ['--apply', '--yes', '--prefer-stash'], positional: 1 },
    main
};
