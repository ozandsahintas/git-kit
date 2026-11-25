const fs = require('fs');
const path = require('path');
const lib = require('../lib');
const { git } = lib;

const usage = `git kit stash-export — bir stash'teki dosyaları klasöre kopyalar

Ne işe yarar
  Stash'i uygulamadan, içindeki değişmiş (ve \`git stash -u\` ile alındıysa untracked) dosyaların
  stash'teki hâlini bir klasöre çıkarır. Çalışma ağacına ve stash'e dokunmaz; binary dosyalar güvenli.
  Kopyalanan dosyaların listesi hedefteki results.txt'ye yazılır.

Kullanım
  git kit stash-export [stash] [hedef]

  stash   varsayılan: stash@{0}   (liste: git stash list)
  hedef   varsayılan: git kit klasöründeki session/stashed-files/<repo>-<branch>-<tarih>/
          (repo dışında kalır; branch, stash'in alındığı branch'tir)

Örnekler
  git kit stash-export
  git kit stash-export stash@{2} ~/Desktop/eski-deneme`;

// -z: yollar tırnaksız/escape'siz gelir (boşluk ve Türkçe karakter sorunsuz)
function listFiles(args) {
    return git(args).split('\0').filter(Boolean);
}

// Stash'in alındığı branch: mesaj "WIP on <branch>: ..." ya da "On <branch>: ..." biçimindedir
function stashBranch(sha) {
    const subject = git(['log', '-1', '--format=%s', sha]).trim();
    const match = subject.match(/^(?:WIP on|On) (.+?):/);
    const branch = match && match[1] !== '(no branch)' ? match[1] : 'detached';
    return branch.replace(/[\/\\:\s]+/g, '-');
}

async function main(options) {
    const stash = options.positional[0] || 'stash@{0}';

    // Sorgular SHA ile yapılır: `stash@{0}^3^{commit}`, 3. ebeveyn yokken bile stash'in kendisine çözülüyor (git 2.56)
    const sha = lib.resolveCommit(stash);
    if (!sha) {
        throw new Error(`Stash bulunamadı: ${stash}`);
    }

    // Varsayılan hedef repo dışında, git kit'in session/ klasöründe; repo + branch + zaman damgası çakışmayı önler
    const dest = options.positional[1]
        ? path.resolve(options.positional[1])
        : lib.sessionDir('stashed-files', `${lib.repoName()}-${stashBranch(sha)}-${lib.timestamp()}`);

    // Tracked değişiklikler: stash'in tabanı (^1) ile stash'lenen çalışma ağacı arası, silinenler hariç
    const entries = listFiles(['diff', '--name-only', '-z', '--diff-filter=d', `${sha}^1`, sha])
        .map(file => ({ file, rev: sha }));

    // `git stash -u` ile alınmışsa untracked dosyalar ^3 commit'indedir
    if (lib.resolveCommit(`${sha}^3`)) {
        entries.push(...listFiles(['ls-tree', '-r', '-z', '--name-only', `${sha}^3`])
            .map(file => ({ file, rev: `${sha}^3` })));
    }

    const results = [];
    for (const { file, rev } of entries) {
        const destinationPath = path.join(dest, file);
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        // İçerik doğrudan stash'ten okunur (binary güvenli); çalışma ağacına dokunulmaz
        fs.writeFileSync(destinationPath, git(['show', `${rev}:${file}`], { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 }));
        results.push(`${file}: ${destinationPath}`);
    }

    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'results.txt'), results.join('\n') + '\n');
    console.log(`${results.length} dosya ${dest} altına kopyalandı, liste: results.txt`);
}

module.exports = {
    name: 'stash-export',
    args: '[stash] [hedef]',
    group: 'Temizlik',
    mode: 'doğrudan',
    summary: "Stash'teki dosyaları uygulamadan klasöre kopyalar",
    usage,
    options: { positional: 2 },
    main
};
