const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const lib = require('../lib');
const { git, gitTry, errorText } = lib;

const { DEFAULT_ROOT, findRepos } = lib;

const usage = `git kit repos-status — bir klasördeki tüm repoların durumunu raporlar

Ne işe yarar
  "Hiçbir yerde unutulmuş iş kalmadı mı?" sorusunu cevaplar; hiçbir şeyi değiştirmez.
  Kök klasörün doğrudan alt klasörlerindeki her repo için bakar:
    - commit edilmemiş değişiklik (ana worktree ve diğer worktree'ler ayrı ayrı)
    - geçerli branch'in push edilmemiş (↑) / çekilmemiş (↓) commit'leri
    - hiçbir remote branch'te olmayan, yalnız yerelde duran commit'ler (tüm branch'ler)
    - stash'ler, ek worktree'ler, detached HEAD
  Linked worktree klasörleri ayrı repo sayılmaz, ait oldukları reponun altında raporlanır.

Ne zaman
  Gün sonunda, makine değiştirmeden / izne çıkmadan önce, sabah ilk iş (--fetch ile).

Kullanım (herhangi bir yerden)
  git kit repos-status [kök] [seçenekler]

  kök          varsayılan: ${DEFAULT_ROOT}

Seçenekler
  --fetch      önce tüm repolarda paralel \`git fetch --prune\` (en fazla 4 eşzamanlı)
  --all        dikkat gerektirmeyen (temiz) repoları da listeler
  --no-pr      PR kolonunu atlar (gh çağrısı yapılmaz)

PR kolonu
  Listelenen her reponun geçerli branch'inden açılmış PR ve durumu (#42 open / draft / merged / closed).
  Repo başına bir gh çağrısı (en fazla 4 eşzamanlı). gh yoksa ya da oturum açık değilse kolon gösterilmez.

Örnek
  git kit repos-status --fetch`;

function fetchRepo(repo) {
    return new Promise(resolve => {
        execFile('git', ['-C', repo, 'fetch', '--prune', '--quiet'], { timeout: 60000 }, error => {
            resolve(error ? (error.stderr || error.message).toString().trim().split('\n').pop() : null);
        });
    });
}

async function fetchAll(repos, limit = 4) {
    const errors = new Map();
    const queue = repos.filter(repo => gitTry(['-C', repo, 'remote']));
    let done = 0;
    const worker = async () => {
        while (queue.length) {
            const repo = queue.shift();
            const error = await fetchRepo(repo);
            if (error) errors.set(repo, error);
            process.stdout.write(`\r  fetch ${++done}/${repos.length}`);
        }
    };
    await Promise.all(Array.from({ length: limit }, worker));
    process.stdout.write('\n');
    return errors;
}

function inspect(repo) {
    const notes = [];
    const hasRemote = Boolean(gitTry(['-C', repo, 'remote']));
    const branch = lib.currentBranch(repo);
    if (!branch) notes.push('detached HEAD');

    const dirty = lib.dirtyCount(repo);
    if (dirty) notes.push(`${dirty} kirli dosya`);

    if (!hasRemote) {
        notes.push('remote yok');
    } else {
        if (gitTry(['-C', repo, 'rev-parse', '--verify', '-q', '@{u}'])) {
            const { ahead, behind } = lib.aheadBehind('HEAD', '@{u}', repo);
            if (ahead) notes.push(`↑${ahead} push edilmemiş`);
            if (behind) notes.push(`↓${behind} geride`);
        } else if (branch) {
            notes.push('branch\'in upstream\'i yok');
        }
        const localOnly = parseInt(git(['-C', repo, 'rev-list', '--count', '--branches', '--not', '--remotes']).trim(), 10);
        if (localOnly) {
            const branches = git(['-C', repo, 'for-each-ref', '--format=%(refname)', 'refs/heads']).split('\n').filter(Boolean)
                .filter(ref => git(['-C', repo, 'rev-list', '-n', '1', ref, '--not', '--remotes']).trim()).length;
            notes.push(`${localOnly} commit yalnız yerelde (${branches} branch)`);
        }
    }

    const stashes = git(['-C', repo, 'stash', 'list']).split('\n').filter(Boolean).length;
    if (stashes) notes.push(`${stashes} stash`);

    const extra = lib.readWorktrees(repo).slice(1);
    if (extra.length) {
        const dirtyWts = extra.filter(wt => !wt.prunable && lib.dirtyCount(wt.path) > 0).length;
        const missing = extra.filter(wt => wt.prunable).length;
        notes.push(`${extra.length} worktree` + [dirtyWts && `${dirtyWts} kirli`, missing && `${missing} dizini yok`].filter(Boolean).map(s => ` (${s})`).join(''));
    }
    return { branch: branch || '(detached)', notes };
}

// Satırların geçerli branch'i için PR etiketi; gh hiçbir repoda cevap vermediyse null (kolon düşer)
async function pullRequestLabels(items, limit = 4) {
    const labels = new Array(items.length).fill('');
    let answered = 0;
    const queue = items.map((item, index) => ({ ...item, index })).filter(item => item.branch);
    const worker = async () => {
        while (queue.length) {
            const { repo, branch, index } = queue.shift();
            const prs = await lib.ghJson(['pr', 'list', '--head', branch, '--state', 'all', '--limit', '20', '--json', lib.PR_FIELDS], repo);
            if (prs === null) continue;
            answered++;
            labels[index] = lib.prLabel(prs);
        }
    };
    await Promise.all(Array.from({ length: limit }, worker));
    return answered ? labels : null;
}

async function main(options) {
    const root = path.resolve(options.positional[0] || DEFAULT_ROOT);
    if (!fs.existsSync(root)) throw new Error(`Klasör yok: ${root}`);

    const repos = findRepos(root);
    console.log(`${root} altında ${repos.length} repo`);
    if (!repos.length) return;

    const fetchErrors = options.fetch ? await fetchAll(repos) : new Map();

    const listed = [];
    let clean = 0;
    for (const repo of repos) {
        let info;
        try {
            info = inspect(repo);
        } catch (error) {
            info = { branch: '?', notes: [`okunamadı: ${errorText(error).split('\n')[0]}`] };
        }
        if (fetchErrors.has(repo)) info.notes.unshift(`fetch hatası: ${fetchErrors.get(repo)}`);
        if (!info.notes.length) clean++;
        if (info.notes.length || options.all) listed.push({ repo, info });
    }

    // PR yalnız listelenen ve feature branch'inde olan satırlar için sorulur
    // (detached / okunamadı / develop-main gibi korumalı branch'ler hariç)
    // Korumalı küme repo başına: o reponun kit.base ayarı (ör. next) da dahil
    const hasOwnBranch = (branch, repo) => !branch.startsWith('(') && branch !== '?' && !lib.protectedBranches(repo).has(branch);
    const prs = options.noPr ? null : await pullRequestLabels(listed.map(({ repo, info }) => ({
        repo,
        branch: hasOwnBranch(info.branch, repo) ? info.branch : null
    })));
    const rows = listed.map(({ repo, info }, i) =>
        [path.basename(repo), info.branch, ...(prs ? [prs[i]] : []), info.notes.join(', ') || '✓ temiz']);

    console.log('');
    if (rows.length) lib.printTable(['Repo', 'Branch', ...(prs ? ['PR'] : []), 'Durum'], rows);
    console.log(`\nÖzet: ${repos.length - clean} repo dikkat istiyor, ${clean} temiz${options.all ? '' : ' (temizleri görmek için --all)'}.`);
    if (!options.fetch) console.log('Not: ↓geride bilgisi son fetch\'e göre; güncel bilgi için --fetch.');
}

module.exports = {
    name: 'repos-status',
    args: '[kök]',
    group: 'Durum / rapor',
    mode: 'salt okunur',
    summary: "Tüm repolarda unutulmuş iş var mı raporu",
    usage,
    options: { flags: ['--fetch', '--all', '--no-pr'], positional: 1 },
    main
};
