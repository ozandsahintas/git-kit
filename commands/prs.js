const path = require('path');
const lib = require('../lib');

const STATES = ['open', 'draft', 'merged', 'closed'];
const DEFAULT_STATES = 'open,draft,merged';
const FIELDS = 'number,title,state,isDraft,headRefName,createdAt,mergedAt,url,changedFiles';
const CONCURRENCY = 4;

const usage = `git kit prs — PR'larını durumuna ve dokunduğu dosyalara göre listeler

Ne işe yarar
  "Açtığım PR'lardan hangileri açık / draft / merged, hangileri şu modüle dokunuyor?" sorusunu
  tek komutla cevaplar; hiçbir şeyi değiştirmez. Bir ya da birden fazla repoya bakabilir.
  --touching ile her PR'ın dosya listesi sayfalanarak eksiksiz alınır: \`gh pr view --json files\`
  listeyi 100 dosyada uyarı vermeden keser, bu komut kesmez (GitHub API sınırı: PR başına 3000 dosya).
  Kapatılmış (merge edilmemiş) PR'lar varsayılan olarak gelmez.

Kullanım
  git kit prs [seçenekler]

  Repo verilmezse içinde bulunduğun repo (origin GitHub'da olmalı).

Seçenekler
  --repo <sahip/ad>[,...]   bu GitHub repolarına bakar
  --repos <kök>             kökün alt klasörlerindeki tüm GitHub repolarına bakar
  --author <login>          varsayılan: @me; herkesin PR'ları için: all
  --state <liste>           open,draft,merged,closed ya da all (varsayılan: ${DEFAULT_STATES})
  --touching <regex>        yalnız dosya yolu regex'e uyan PR'lar; eşleşen/toplam dosya sayısıyla
  --since <YYYY-AA-GG>      bu tarihte ya da sonra açılmış PR'lar
  --limit <n>               repo başına en fazla kaç PR okunur (varsayılan: 200)
  --json                    tablo yerine JSON (--touching ile eşleşen dosyalar da dahil)

Gereksinim: gh kurulu ve oturum açık (gh auth login).

Örnekler
  git kit prs
  git kit prs --touching '^src/cart/'
  git kit prs --repos ~/code --touching 'Payment|payment' --since 2026-01-01
  git kit prs --repo acme/api,acme/web --state all --json`;

function prState(pr) {
    if (pr.state === 'OPEN') return pr.isDraft ? 'draft' : 'open';
    return pr.state.toLowerCase();
}

function parseStates(value) {
    if (value === 'all') return new Set(STATES);
    const states = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const unknown = states.filter(s => !STATES.includes(s));
    if (unknown.length || !states.length) {
        throw new Error(`--state: bilinmeyen durum: ${unknown.join(', ') || '(boş)'} (geçerli: ${STATES.join(', ')}, all)`);
    }
    return new Set(states);
}

function parseSince(value) {
    if (value === undefined) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null;
    if (!date || Number.isNaN(date.getTime())) throw new Error(`--since YYYY-AA-GG bekliyor: ${value}`);
    return date;
}

function parseRegex(value) {
    if (value === undefined) return null;
    try {
        return new RegExp(value);
    } catch (error) {
        throw new Error(`--touching geçersiz regex: ${error.message}`);
    }
}

function parseLimit(value) {
    if (value === undefined) return 200;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) throw new Error(`--limit pozitif tam sayı bekliyor: ${value}`);
    return limit;
}

// Bakılacak repolar (sahip/ad), tekrarsız
function resolveTargets(options) {
    const slugs = [];
    if (options.repo) slugs.push(...options.repo.split(',').map(s => s.trim()).filter(Boolean));
    if (options.repos) {
        const root = path.resolve(options.repos);
        for (const repo of lib.findRepos(root)) {
            const slug = lib.githubSlug(repo);
            if (slug) slugs.push(slug);
        }
        if (!slugs.length) throw new Error(`${root} altında origin'i GitHub'da olan repo bulunamadı`);
    }
    if (!options.repo && !options.repos) {
        const slug = lib.githubSlug();
        if (!slug) throw new Error('Bu klasör origin\'i GitHub\'da olan bir repo değil; --repo <sahip/ad> ya da --repos <kök> ver.');
        slugs.push(slug);
    }
    for (const slug of slugs) {
        if (!/^[^/\s]+\/[^/\s]+$/.test(slug)) throw new Error(`--repo sahip/ad biçiminde olmalı: ${slug}`);
    }
    return [...new Set(slugs)];
}

async function listPullRequests(slug, options) {
    const argv = ['pr', 'list', '-R', slug, '--state', 'all', '--limit', String(options.limitValue), '--json', FIELDS];
    if (options.authorValue !== 'all') argv.push('--author', options.authorValue);
    const result = await lib.gh(argv);
    if (!result.ok) return { error: result.error, missing: result.missing };
    return { prs: JSON.parse(result.stdout).map(pr => ({ ...pr, repo: slug })) };
}

// PR'ın tüm dosyaları (sayfalanır, 100 sınırı yok)
async function listFiles(pr) {
    const result = await lib.gh(['api', '--paginate', `repos/${pr.repo}/pulls/${pr.number}/files?per_page=100`, '--jq', '.[].filename']);
    if (!result.ok) return { error: result.error };
    return { files: result.stdout.split('\n').filter(Boolean) };
}

function progress(text) {
    if (process.stderr.isTTY) process.stderr.write(`\r${text}`);
}

async function main(options) {
    const states = parseStates(options.state || DEFAULT_STATES);
    const since = parseSince(options.since);
    const touching = parseRegex(options.touching);
    options.limitValue = parseLimit(options.limit);
    options.authorValue = options.author || '@me';
    const targets = resolveTargets(options);

    const failures = [];
    const listed = await lib.mapLimit(targets, CONCURRENCY, slug => listPullRequests(slug, options));
    if (listed.every(r => r.missing)) throw new Error('gh bulunamadı. Kurulum: https://cli.github.com, ardından: gh auth login');
    if (listed.every(r => r.error)) throw new Error(`gh çalışmadı: ${listed[0].error}`);

    let prs = [];
    listed.forEach((result, i) => {
        if (result.error) failures.push(`${targets[i]}: ${result.error}`);
        else prs.push(...result.prs);
    });
    prs = prs.filter(pr => states.has(prState(pr)) && (!since || new Date(pr.createdAt) >= since));

    let hiddenByTouching = 0;
    if (touching && prs.length) {
        let done = 0;
        const fileLists = await lib.mapLimit(prs, CONCURRENCY, async pr => {
            const result = await listFiles(pr);
            progress(`  dosyalar ${++done}/${prs.length}`);
            return result;
        });
        progress(`${' '.repeat(30)}\r`);
        prs = prs.filter((pr, i) => {
            const result = fileLists[i];
            if (result.error) {
                failures.push(`${pr.repo}#${pr.number}: dosyalar alınamadı: ${result.error}`);
                return false;
            }
            pr.totalFiles = result.files.length;
            pr.matchedFiles = result.files.filter(file => touching.test(file));
            if (!pr.matchedFiles.length) hiddenByTouching++;
            return pr.matchedFiles.length > 0;
        });
    }

    prs.sort((a, b) => a.repo.localeCompare(b.repo) || b.number - a.number);

    if (options.json) {
        console.log(JSON.stringify(prs.map(pr => ({
            repo: pr.repo,
            number: pr.number,
            state: prState(pr),
            title: pr.title,
            branch: pr.headRefName,
            createdAt: pr.createdAt,
            mergedAt: pr.mergedAt || null,
            url: pr.url,
            files: touching ? pr.totalFiles : pr.changedFiles,
            ...(touching ? { matchedFiles: pr.matchedFiles } : {})
        })), null, 2));
        lib.printFailures(failures);
        return;
    }

    const multiRepo = targets.length > 1;
    const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
    const headers = [...(multiRepo ? ['Repo'] : []), '#', 'Durum', 'Tarih', 'Branch', 'Başlık', touching ? 'Eşleşen/Toplam' : 'Dosya'];
    const rows = prs.map(pr => [
        ...(multiRepo ? [pr.repo.split('/')[1]] : []),
        `#${pr.number}`,
        prState(pr),
        pr.createdAt.slice(0, 10),
        shorten(pr.headRefName, 45),
        shorten(pr.title, 60),
        touching ? `${pr.matchedFiles.length}/${pr.totalFiles}` : String(pr.changedFiles)
    ]);

    console.log('');
    if (rows.length) lib.printTable(headers, rows);
    else console.log('  (eşleşen PR yok)');

    const filters = [
        `durum: ${[...states].join(',')}`,
        `yazar: ${options.authorValue}`,
        since && `${options.since} ve sonrası`,
        touching && `dosya: /${touching.source}/`
    ].filter(Boolean).join(' · ');
    console.log(`\n${prs.length} PR · ${targets.length} repo · ${filters}` +
        (hiddenByTouching ? ` · ${hiddenByTouching} PR'da eşleşen dosya yok, gösterilmedi` : ''));
    lib.printFailures(failures);
}

module.exports = {
    name: 'prs',
    group: 'Durum / rapor',
    mode: 'salt okunur',
    summary: "PR'larını durum ve dokunduğu dosyalara göre listeler (1 veya çok repo)",
    usage,
    options: {
        flags: ['--json'],
        values: ['--repo', '--repos', '--author', '--state', '--touching', '--since', '--limit']
    },
    main
};
