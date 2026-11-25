const { execFile, execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Tüm komutların ortak yardımcıları

const REMOTE = 'origin';
const DEFAULT_BASE = 'develop';
const BASE_CONFIG_KEY = 'kit.base';
const PROTECTED = new Set(['develop', 'main', 'master']);
// git kit'in ürettiği yerel kayıtlar (silinen branch log'u, stash dışa aktarımları, stash yedekleri).
// Tek klasörde toplanır ve git'e girmez (.gitignore: session/).
const SESSION_DIR = path.join(__dirname, 'session');
const LOG_FILE = path.join(SESSION_DIR, 'removed-branches.log');
// shortName() bu önekleri atar: fix/x ve feature/x → x (worktree klasörü ve yedek adı tutarlı olsun)
const BRANCH_PREFIX = /^(feature|feat|fix|bugfix|hotfix|refactor|chore|docs|test|release|backup)\//;

function git(argv, options = {}) {
    return execFileSync('git', argv, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 256,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
    });
}

// Base branch (start/rebase varsayılan tabanı, overview karşılaştırması) repo başına çözülür:
//   `git config kit.base <branch>` (origin/ önekli de olur) varsa o, yoksa develop.
// Ayar repo'nun .git/config'ine yazılır; her repo kendi base'ini taşır, repolar arasında geçerken bir şey değiştirmek gerekmez.
const baseCache = new Map();
function base(cwd) {
    const key = cwd || process.cwd();
    if (!baseCache.has(key)) {
        const configured = gitTry(['config', '--get', BASE_CONFIG_KEY], { cwd });
        baseCache.set(key, configured ? configured.replace(new RegExp(`^${REMOTE}/`), '') : DEFAULT_BASE);
    }
    return baseCache.get(key);
}

function baseRef(cwd) {
    return `${REMOTE}/${base(cwd)}`;
}

// develop/main/master + repo'nun base'i (ör. next): silinmez, rebase edilmez
function protectedBranches(cwd) {
    return new Set([...PROTECTED, base(cwd)]);
}

// Çıkış kodu sorulan komutlar için (merge-base --is-ancestor, show-ref --verify vb.)
function gitOk(argv, options = {}) {
    try {
        git(argv, options);
        return true;
    } catch {
        return false;
    }
}

// Başarısızsa null döner, başarılıysa kırpılmış çıktı
function gitTry(argv, options = {}) {
    try {
        return git(argv, options).trim();
    } catch {
        return null;
    }
}

function errorText(error) {
    return (error.stderr && error.stderr.toString().trim()) || error.message;
}

function realPath(p) {
    try {
        return fs.realpathSync(p);
    } catch {
        return path.resolve(p);
    }
}

// --no-fetch → noFetch
function optionKey(flag) {
    return flag.replace(/^--/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
}

// spec: { flags: ['--apply', ...], values: ['--to', ...], positional: false | true | <en fazla adet> }
// hint: hata mesajının altına eklenen metin (ör. "Yardım: git kit help sync")
function parseOptions(hint, spec = {}, argv = process.argv.slice(2)) {
    const flags = spec.flags || [];
    const values = spec.values || [];
    const maxPositional = spec.positional === true ? Infinity : (spec.positional || 0);
    const fail = message => {
        throw new Error(`${message}\n${hint}`);
    };

    const options = { positional: [] };
    flags.forEach(flag => (options[optionKey(flag)] = false));

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const eq = arg.indexOf('=');
        const name = arg.startsWith('--') && eq !== -1 ? arg.slice(0, eq) : arg;

        if (flags.includes(arg)) {
            options[optionKey(arg)] = true;
        } else if (values.includes(name)) {
            const value = eq !== -1 && name !== arg ? arg.slice(eq + 1) : argv[++i];
            if (value === undefined || value === '' || value.startsWith('--')) fail(`${name} bir değer bekliyor`);
            options[optionKey(name)] = value;
        } else if (arg.startsWith('-')) {
            fail(`Bilinmeyen seçenek: ${arg}`);
        } else if (options.positional.length < maxPositional) {
            options.positional.push(arg);
        } else {
            fail(`Beklenmeyen argüman: ${arg}`);
        }
    }
    return options;
}

// Repo kontrolü + origin'i güncelle (--prune yalnızca refs/remotes/origin/* altını etkiler)
function prepare(options) {
    git(['rev-parse', '--git-dir']); // git reposu değilse burada hata verir
    if (options.noFetch) return;

    console.log(`git fetch --prune ${REMOTE} ...`);
    try {
        git(['fetch', '--prune', REMOTE]);
    } catch (error) {
        throw new Error(`fetch başarısız (offline ise --no-fetch ile dene): ${errorText(error)}`);
    }
}

// -z: yollar tırnaksız gelir (boşluk ve Türkçe karakter sorunsuz); kayıtlar boş alanla ayrılır.
// İlk kayıt her zaman ana worktree'dir.
function readWorktrees(cwd) {
    const worktrees = [];
    let current = null;
    for (const token of git(['worktree', 'list', '--porcelain', '-z'], { cwd }).split('\0')) {
        if (token === '') {
            current = null;
            continue;
        }
        const space = token.indexOf(' ');
        const key = space === -1 ? token : token.slice(0, space);
        const value = space === -1 ? '' : token.slice(space + 1);

        if (key === 'worktree') {
            current = { path: value, head: '', branch: null, detached: false, locked: false, prunable: false };
            worktrees.push(current);
        } else if (!current) {
            continue;
        } else if (key === 'HEAD') {
            current.head = value;
        } else if (key === 'branch') {
            current.branch = value.replace(/^refs\/heads\//, '');
        } else if (key === 'detached') {
            current.detached = true;
        } else if (key === 'locked') {
            current.locked = true;
        } else if (key === 'prunable') {
            current.prunable = true;
        }
    }
    return worktrees;
}

function currentTopLevel() {
    return realPath(git(['rev-parse', '--show-toplevel']).trim());
}

// Detached HEAD ise null
function currentBranch(cwd) {
    return gitTry(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd });
}

function refExists(ref, cwd) {
    return gitOk(['show-ref', '--verify', '--quiet', ref], { cwd });
}

function resolveCommit(rev, cwd) {
    return gitTry(['rev-parse', '--verify', '-q', `${rev}^{commit}`], { cwd });
}

// left'te olup right'ta olmayan (ahead) ve tersi (behind) commit sayıları
function aheadBehind(left, right, cwd) {
    const [ahead, behind] = git(['rev-list', '--left-right', '--count', `${left}...${right}`], { cwd })
        .trim()
        .split(/\s+/)
        .map(n => parseInt(n, 10));
    return { ahead, behind };
}

// untracked=false: yalnızca izlenen dosyalardaki değişiklikler (merge/rebase'i engelleyenler)
function dirtyCount(worktreePath, untracked = true) {
    return git(['-C', worktreePath, 'status', '--porcelain', `--untracked-files=${untracked ? 'all' : 'no'}`])
        .split('\n')
        .filter(Boolean).length;
}

function readBranches() {
    return git(['for-each-ref', '--format=%(refname:lstrip=2)%00%(objectname)%00%(subject)', 'refs/heads'])
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [name, sha, subject] = line.split('\0');
            return { name, sha, subject };
        });
}

function readRemoteBranches() {
    const names = git(['for-each-ref', '--format=%(refname:lstrip=3)', `refs/remotes/${REMOTE}`])
        .split('\n')
        .filter(name => name && name !== 'HEAD');
    return new Set(names);
}

// Silinmeyecek branch'ler: benzersiz commit kontrolünde "güvenli referans" sayılırlar
function keptBranches(branches, onRemote) {
    const kept = protectedBranches();
    return branches
        .filter(b => onRemote.has(b.name) || kept.has(b.name))
        .map(b => b.name);
}

// rev'den ulaşılabilen ama origin dallarında, etiketlerde ve `kept` branch'lerinde bulunmayan commit sayısı
function uniqueCommits(rev, kept) {
    const out = git([
        'rev-list', '--count', rev,
        '--not', `--remotes=${REMOTE}`, '--tags', ...kept.map(name => `refs/heads/${name}`)
    ]);
    return parseInt(out.trim(), 10);
}

// feature/user-roles → user-roles (yedek ve worktree adları için)
function shortName(branch) {
    return branch.replace(BRANCH_PREFIX, '').replace(/\//g, '-');
}

// backup/<ad>-YYYYMMDD-HHmm; ad doluysa -2, -3 ...
function createBackup(branch, rev = 'HEAD') {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const base = `backup/${shortName(branch)}-${stamp}`;

    let name = base;
    for (let i = 2; refExists(`refs/heads/${name}`); i++) name = `${base}-${i}`;
    git(['branch', name, rev]);
    return name;
}

// session/ altında (yoksa oluşturarak) bir klasör: sessionDir('stashed-files', 'x') → <kit>/session/stashed-files/x
function sessionDir(...parts) {
    const dir = path.join(SESSION_DIR, ...parts);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Klasör adları için: YYYYMMDD-HHmmss
function timestamp(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Reponun adı = ana worktree klasörünün adı (linked worktree'den çalışınca da aynı ad)
function repoName(cwd) {
    return path.basename(readWorktrees(cwd)[0].path);
}

function gitVersionAtLeast(major, minor) {
    const match = git(['--version']).match(/(\d+)\.(\d+)/);
    if (!match) return false;
    const [maj, min] = [parseInt(match[1], 10), parseInt(match[2], 10)];
    return maj > major || (maj === major && min >= minor);
}

// Çalışma ağacına dokunmadan birleştirme simülasyonu (git ≥ 2.38).
// Dönüş: çakışan dosya listesi ([] = çakışma yok) veya sürüm yetmezse null
function predictConflicts(base, head) {
    if (!gitVersionAtLeast(2, 38)) return null;
    const result = spawnSync('git', ['merge-tree', '--write-tree', '--name-only', '--no-messages', base, head], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 64
    });
    if (result.status === 0) return [];
    if (result.status === 1) return result.stdout.split('\n').slice(1).filter(Boolean);
    throw new Error(`merge-tree başarısız: ${(result.stderr || '').trim()}`);
}

// Türkçe göreli zaman: "3 gün önce"
function relativeTime(unixSeconds) {
    const seconds = Math.max(0, Date.now() / 1000 - unixSeconds);
    const units = [['yıl', 31536000], ['ay', 2592000], ['hafta', 604800], ['gün', 86400], ['saat', 3600], ['dakika', 60]];
    for (const [label, size] of units) {
        if (seconds >= size) return `${Math.floor(seconds / size)} ${label} önce`;
    }
    return 'az önce';
}

// Sütunları hizalı düz metin tablo
function printTable(headers, rows, indent = '  ') {
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
    const line = cells => indent + cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
    console.log(line(headers));
    console.log(indent + widths.map(w => '─'.repeat(w)).join('  '));
    rows.forEach(r => console.log(line(r)));
}

async function confirm(question, options) {
    if (options.yes) return true;
    if (!process.stdin.isTTY) throw new Error('Etkileşimli terminal yok; onayı atlamak için --yes ver.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question(question, resolve));
    rl.close();
    return /^(e|evet|y|yes)$/i.test(answer.trim());
}

function printFailures(failures) {
    if (!failures.length) return;
    console.error('\nHatalar:');
    failures.forEach(f => console.error(`  ${f}`));
    process.exitCode = 1;
}

// Ham gh çağrısı: { ok, stdout, error, missing }. Hiç throw etmez.
// gh'nin stderr'e bastığı ipuçları ("gh event listen" vb.) yakalanır, ekrana basılmaz; hata olursa ilk anlamlı satırı döner.
function gh(argv, cwd, timeout = 60000) {
    return new Promise(resolve => {
        execFile('gh', argv, {
            cwd,
            encoding: 'utf8',
            timeout,
            maxBuffer: 1024 * 1024 * 256,
            env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }
        }, (error, stdout, stderr) => {
            if (!error) return resolve({ ok: true, stdout });
            const message = (stderr || '').split('\n').map(s => s.trim()).find(Boolean) || error.message;
            resolve({ ok: false, stdout, error: message, missing: error.code === 'ENOENT' });
        });
    });
}

// gh çağrısı, JSON döner. gh yoksa / oturum yoksa / GitHub reposu değilse null (hata sessizce yutulur)
async function ghJson(argv, cwd) {
    const result = await gh(argv, cwd, 20000);
    if (!result.ok) return null;
    try {
        return JSON.parse(result.stdout);
    } catch {
        return null;
    }
}

// items üzerinde en fazla `limit` eşzamanlı async fn; sonuçlar giriş sırasıyla
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// git kit klasörünün bir üstü (ör. ~/Documents/GitHub): repos-status ve prs --repos için varsayılan kök
const DEFAULT_ROOT = path.resolve(__dirname, '..');

// Kökün doğrudan alt klasörlerindeki repolar; linked worktree klasörleri ayrı repo sayılmaz
function findRepos(root) {
    return fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(root, entry.name))
        .filter(dir => {
            const dotGit = path.join(dir, '.git');
            if (!fs.existsSync(dotGit)) return false;
            // .git dosyası "gitdir: .../worktrees/x" ise bu bir linked worktree'dir
            if (fs.statSync(dotGit).isFile()) return !/[\\/]worktrees[\\/]/.test(fs.readFileSync(dotGit, 'utf8'));
            return true;
        })
        .sort((a, b) => a.localeCompare(b));
}

// origin URL'inden GitHub owner/ad (https ve ssh); GitHub değilse null
function githubSlug(cwd) {
    const url = gitTry(['remote', 'get-url', REMOTE], { cwd });
    const match = url && url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    return match ? `${match[1]}/${match[2]}` : null;
}

// Aynı branch'in birden fazla PR'ı olabilir (kapatılıp yeniden açılmış): açık > merged > kapalı, sonra en yenisi
const PR_FIELDS = 'number,state,isDraft,headRefName';
function prLabel(prs) {
    if (!prs || !prs.length) return '';
    const rank = pr => ({ OPEN: 0, MERGED: 1 })[pr.state] ?? 2;
    const pr = [...prs].sort((a, b) => rank(a) - rank(b) || b.number - a.number)[0];
    const state = pr.state === 'OPEN' && pr.isDraft ? 'draft' : pr.state.toLowerCase();
    return `#${pr.number} ${state}`;
}

// Benim PR'larım, head branch adına göre gruplu; gh kullanılamıyorsa null
async function myPullRequestsByBranch(cwd) {
    const prs = await ghJson(['pr', 'list', '--state', 'all', '--author', '@me', '--limit', '500', '--json', PR_FIELDS], cwd);
    if (!prs) return null;
    const byBranch = new Map();
    for (const pr of prs) {
        if (!byBranch.has(pr.headRefName)) byBranch.set(pr.headRefName, []);
        byBranch.get(pr.headRefName).push(pr);
    }
    return byBranch;
}

function run(main) {
    main().catch(error => {
        console.error(errorText(error));
        process.exit(1);
    });
}

module.exports = {
    REMOTE, DEFAULT_BASE, BASE_CONFIG_KEY, PROTECTED, SESSION_DIR, LOG_FILE,
    sessionDir, timestamp, repoName,
    base, baseRef, protectedBranches,
    git, gitOk, gitTry, errorText, realPath, parseOptions, prepare,
    readWorktrees, currentTopLevel, currentBranch, refExists, resolveCommit, aheadBehind, dirtyCount,
    readBranches, readRemoteBranches, keptBranches, uniqueCommits,
    shortName, createBackup, gitVersionAtLeast, predictConflicts,
    relativeTime, printTable, confirm, printFailures, run,
    PR_FIELDS, gh, ghJson, prLabel, myPullRequestsByBranch,
    mapLimit, DEFAULT_ROOT, findRepos, githubSlug
};
