import { config } from 'dotenv';
config({ path: '.env', quiet: true });
config({ path: '.env.local', quiet: true, override: true });

import * as fs from 'node:fs';

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

class Spinner {
    private static FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private interval: ReturnType<typeof setInterval> | null = null;
    private frame = 0;
    text = '';

    start(text: string): void {
        this.text = text;
        this.interval = setInterval(() => {
            const f = Spinner.FRAMES[this.frame++ % Spinner.FRAMES.length];
            process.stdout.write(`\r${f} ${this.text}  `);
        }, 80);
    }

    succeed(text: string): void { this._stop(`✓ ${text}`); }
    fail(text: string):    void { this._stop(`✗ ${text}`); }
    info(text: string):    void { this._stop(`  ${text}`); }

    private _stop(finalText = ''): void {
        if (this.interval) { clearInterval(this.interval); this.interval = null; }
        process.stdout.write(`\r${finalText.padEnd(100)}\n`);
    }
}

const spinner = new Spinner();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodeSearchItem {
    name: string;
    path: string;
    html_url: string;
    repository: { full_name: string };
}

interface GitHubCodeSearchResponse {
    total_count: number;
    incomplete_results: boolean;
    items: CodeSearchItem[];
}

interface FoundKey {
    repo: string;
    filePath: string;
    fileUrl: string;
    line: number;
    key: string;
    context: string;
}

interface ApiKeysFile {
    generatedAt: string;
    status: 'searching' | 'validating' | 'complete';
    candidates: string[];
    validKeys: string[];
}

// Cache types — persisted to .search-cache.json between runs
interface CachedFileItem {
    path: string;
    html_url: string;
    repo: string;
}

interface CachedFoundKey {
    key: string;
    line: number;
    context: string;
}

interface SearchCache {
    startedAt: string;
    // query string → list of files returned by GitHub Search
    completedQueries: Record<string, CachedFileItem[]>;
    // html_url → keys extracted from that file (empty array = file processed, no keys)
    processedFiles: Record<string, CachedFoundKey[]>;
    // key string → validation result
    validatedKeys: Record<string, 'valid' | 'exhausted' | 'invalid'>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API             = 'https://api.github.com';
const TINYPNG_ENDPOINT       = 'https://api.tinypng.com/shrink';
const INTER_REQUEST_DELAY_MS = 2000;
const INTER_FILE_DELAY_MS    = 1000;
const VALIDATION_DELAY_MS    = 500;
const KEY_REGEX              = /\b([A-Za-z0-9]{32})\b/g;
const CONTEXT_KEYWORDS       = /tinypng|tinify|apikey|api_key|TINYPNG|TINIFY/i;
const API_KEYS_PATH          = 'api-keys.json';
const CACHE_PATH             = '.search-cache.json';

const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

const SEARCH_QUERIES = [
    'tinify.key',
    'tinypng apiKey',
    'tinypng api_key',
    'TINYPNG_API_KEY',
    'TINIFY_KEY',
    'api.tinypng.com',
];

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function loadCache(): SearchCache | null {
    try {
        return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as SearchCache;
    } catch {
        return null;
    }
}

function saveCache(cache: SearchCache): void {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function emptyCache(): SearchCache {
    return {
        startedAt: new Date().toISOString(),
        completedQueries: {},
        processedFiles: {},
        validatedKeys: {},
    };
}

// ---------------------------------------------------------------------------
// api-keys.json helpers
// ---------------------------------------------------------------------------

function loadApiKeys(): ApiKeysFile | null {
    try {
        return JSON.parse(fs.readFileSync(API_KEYS_PATH, 'utf8')) as ApiKeysFile;
    } catch {
        return null;
    }
}

function writeApiKeys(data: ApiKeysFile): void {
    fs.writeFileSync(
        API_KEYS_PATH,
        JSON.stringify({ ...data, generatedAt: new Date().toISOString() }, null, 2)
    );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubGet<T>(path: string, token: string): Promise<T> {
    while (true) {
        const response = await fetch(`${GITHUB_API}${path}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });

        const remaining  = response.headers.get('X-RateLimit-Remaining');
        const reset      = response.headers.get('X-RateLimit-Reset');
        const retryAfter = response.headers.get('Retry-After');

        if (response.status === 403 || response.status === 429) {
            let waitMs = 60_000;
            if (retryAfter) waitMs = parseInt(retryAfter, 10) * 1000;
            else if (reset) waitMs = Math.max(0, parseInt(reset, 10) * 1000 - Date.now()) + 1000;
            const saved = spinner.text;
            spinner.text = `${saved} — rate limited, waiting ${Math.round(waitMs / 1000)}s`;
            await sleep(waitMs);
            spinner.text = saved;
            continue;
        }

        if (!response.ok) throw new Error(`GitHub API error ${response.status} for ${path}`);

        if (remaining && parseInt(remaining, 10) === 0 && reset) {
            const waitMs = Math.max(0, parseInt(reset, 10) * 1000 - Date.now()) + 1000;
            const saved = spinner.text;
            spinner.text = `${saved} — rate limit exhausted, waiting ${Math.round(waitMs / 1000)}s`;
            await sleep(waitMs);
            spinner.text = saved;
        }

        return response.json() as Promise<T>;
    }
}

function extractCandidateKeys(content: string, filePath: string): FoundKey[] {
    const found: FoundKey[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
        const windowStart = Math.max(0, idx - 5);
        const windowEnd   = Math.min(lines.length - 1, idx + 5);
        const window      = lines.slice(windowStart, windowEnd + 1).join('\n');

        if (!CONTEXT_KEYWORDS.test(window)) return;

        KEY_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = KEY_REGEX.exec(line)) !== null) {
            found.push({ repo: '', filePath, fileUrl: '', line: idx + 1, key: match[1], context: line.trim() });
        }
    });

    return found;
}

function toRawUrl(htmlUrl: string): string {
    return htmlUrl
        .replace('https://github.com/', 'https://raw.githubusercontent.com/')
        .replace('/blob/', '/');
}

async function searchQuery(
    query: string,
    token: string,
    onPage: (page: number, total: number) => void,
): Promise<Map<string, CodeSearchItem>> {
    const results = new Map<string, CodeSearchItem>();
    let page = 1;

    while (true) {
        const encoded = encodeURIComponent(query);
        const path    = `/search/code?q=${encoded}&per_page=30&page=${page}`;

        let data: GitHubCodeSearchResponse;
        try {
            data = await githubGet<GitHubCodeSearchResponse>(path, token);
        } catch (err) {
            process.stdout.write(`\n  Error on page ${page}: ${err}\n`);
            break;
        }

        for (const item of data.items) results.set(item.html_url, item);
        onPage(page, data.total_count);

        if (data.items.length < 30 || page * 30 >= Math.min(data.total_count, 1000)) break;
        page++;
        await sleep(INTER_REQUEST_DELAY_MS);
    }

    return results;
}

async function fetchFileContent(rawUrl: string, token: string): Promise<string | null> {
    try {
        const response = await fetch(rawUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return null;
        return response.text();
    } catch { return null; }
}

async function validateKey(key: string): Promise<'valid' | 'exhausted' | 'invalid'> {
    try {
        const response = await fetch(TINYPNG_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: 'Basic ' + Buffer.from('api:' + key).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: TINY_PNG,
        });
        if (response.status === 201) return 'valid';
        if (response.status === 429) return 'exhausted';
        return 'invalid';
    } catch { return 'invalid'; }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error(
            'Error: GITHUB_TOKEN is not set.\n' +
            'Create a token at https://github.com/settings/tokens  (scope: public_repo)\n\n' +
            '  export GITHUB_TOKEN=ghp_yourToken\n' +
            '  npm run search-keys'
        );
        process.exit(1);
    }

    // ── Cache & Resume ─────────────────────────────────────────────────────
    const previousApiKeys = loadApiKeys();
    const previousCache   = loadCache();
    const isResumable     = previousApiKeys !== null
                         && previousApiKeys.status !== 'complete'
                         && previousCache   !== null
                         && (previousApiKeys.candidates.length > 0 || Object.keys(previousCache.completedQueries).length > 0);

    let cache: SearchCache;

    if (isResumable) {
        cache = previousCache!;
        const nQueries   = Object.keys(cache.completedQueries).length;
        const nFiles     = Object.keys(cache.processedFiles).length;
        const nValidated = Object.keys(cache.validatedKeys).length;
        console.log(`\n♻️  Resuming previous run (${cache.startedAt})`);
        console.log(`   Queries:    ${nQueries}/${SEARCH_QUERIES.length} cached`);
        console.log(`   Files:      ${nFiles} already processed`);
        console.log(`   Keys:       ${nValidated} already validated`);
        console.log(`   Candidates: ${previousApiKeys!.candidates.length} | Valid: ${previousApiKeys!.validKeys.length}`);
        console.log(`\n   Skipping completed steps...\n`);
        // Preserve existing api-keys.json, just reset status to searching
        writeApiKeys({ ...previousApiKeys!, status: 'searching' });
    } else {
        if (previousApiKeys?.status === 'complete') {
            console.log(`✓ Previous run completed — starting fresh\n`);
        }
        cache = emptyCache();
        writeApiKeys({ generatedAt: '', status: 'searching', candidates: [], validKeys: [] });
        console.log(`📄 ${API_KEYS_PATH} created — updated continuously\n`);
    }

    // ── Phase 1: GitHub-Suche ──────────────────────────────────────────────
    const allFiles = new Map<string, CodeSearchItem>();

    for (const query of SEARCH_QUERIES) {
        // Resume: query already completed in a previous run
        if (cache.completedQueries[query]) {
            const cached = cache.completedQueries[query];
            for (const item of cached) {
                allFiles.set(item.html_url, {
                    name: item.path.split('/').pop() ?? '',
                    path: item.path,
                    html_url: item.html_url,
                    repository: { full_name: item.repo },
                });
            }
            spinner.succeed(`"${query}" — ${cached.length} files (cached)`);
            continue;
        }

        spinner.start(`Searching: "${query}" | Files so far: ${allFiles.size}`);

        const results = await searchQuery(query, token, (page, total) => {
            spinner.text = `Searching: "${query}" | Page ${page} | ~${total} hits | Files: ${allFiles.size}`;
        });

        for (const [url, item] of results) allFiles.set(url, item);

        // Persist to cache immediately
        cache.completedQueries[query] = [...results.values()].map((item) => ({
            path: item.path,
            html_url: item.html_url,
            repo: item.repository.full_name,
        }));
        saveCache(cache);

        spinner.succeed(`"${query}" — ${results.size} files found`);
        await sleep(INTER_REQUEST_DELAY_MS);
    }

    // ── Phase 2: Datei-Inhalte abrufen & Keys extrahieren ─────────────────
    const allFoundKeys: FoundKey[] = [];
    let fileIndex = 0;

    // Pre-fill allFoundKeys from cache so the running total is accurate
    let cachedKeyCount = 0;
    for (const [htmlUrl, item] of allFiles) {
        const cached = cache.processedFiles[htmlUrl];
        if (cached !== undefined) {
            for (const ck of cached) {
                allFoundKeys.push({ repo: item.repository.full_name, filePath: item.path, fileUrl: htmlUrl, line: ck.line, key: ck.key, context: ck.context });
            }
            cachedKeyCount += cached.length;
        }
    }
    if (cachedKeyCount > 0) {
        console.log(`  ${Object.keys(cache.processedFiles).length} files loaded from cache (${cachedKeyCount} keys)\n`);
    }

    for (const [htmlUrl, item] of allFiles) {
        fileIndex++;

        // Resume: file already processed
        if (cache.processedFiles[htmlUrl] !== undefined) continue;

        spinner.start(`Fetching ${fileIndex}/${allFiles.size} | Keys: ${allFoundKeys.length}`);

        const rawUrl  = toRawUrl(htmlUrl);
        const content = await fetchFileContent(rawUrl, token);
        await sleep(INTER_FILE_DELAY_MS);

        const keys = content ? extractCandidateKeys(content, item.path) : [];
        for (const k of keys) {
            k.repo    = item.repository.full_name;
            k.fileUrl = htmlUrl;
            allFoundKeys.push(k);
        }

        // Persist this file's result (even if empty — marks it as done)
        cache.processedFiles[htmlUrl] = keys.map((k) => ({ key: k.key, line: k.line, context: k.context }));
        saveCache(cache);

        if (keys.length > 0) {
            const uniqueCandidates = [...new Set(allFoundKeys.map((k) => k.key))];
            writeApiKeys({ generatedAt: '', status: 'searching', candidates: uniqueCandidates, validKeys: [] });
        }
    }

    spinner.succeed(`${allFiles.size} files processed — ${allFoundKeys.length} candidates`);

    // Deduplicate
    const seen = new Set<string>();
    const unique = allFoundKeys.filter((k) => {
        const id = `${k.repo}|${k.filePath}|${k.key}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    if (unique.length > 0) {
        const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
        console.log('\n' + col('REPO', 35) + col('FILE', 30) + col('LINE', 6) + col('KEY...', 12) + 'CONTEXT');
        console.log('─'.repeat(100));
        for (const k of unique) {
            console.log(col(k.repo, 35) + col(k.filePath, 30) + col(String(k.line), 6) + col(k.key.slice(0, 8) + '...', 12) + k.context.slice(0, 40));
        }
    }

    // ── Phase 3: Validierung ───────────────────────────────────────────────
    const uniqueKeyStrings = [...new Set(unique.map((k) => k.key))];
    console.log(`\nValidating ${uniqueKeyStrings.length} unique key(s) against TinyPNG API...`);

    const validKeys: string[] = [];
    const allCandidates = [...new Set(allFoundKeys.map((k) => k.key))];

    writeApiKeys({ generatedAt: '', status: 'validating', candidates: allCandidates, validKeys: [] });

    for (const [i, key] of uniqueKeyStrings.entries()) {
        // Resume: key already validated in a previous run
        if (cache.validatedKeys[key] !== undefined) {
            const result = cache.validatedKeys[key];
            const marker = result === 'valid' ? '✓' : result === 'exhausted' ? '~' : '✗';
            if (result === 'valid') validKeys.push(key);
            spinner.succeed(`[${marker}] ${key.slice(0, 8)}...  (${result}) — Cache`);
            continue;
        }

        spinner.start(
            `Validating ${i + 1}/${uniqueKeyStrings.length}: ${key.slice(0, 8)}...` +
            ` | Valid: ${validKeys.length}`
        );

        const result = await validateKey(key);
        const marker = result === 'valid' ? '✓' : result === 'exhausted' ? '~' : '✗';

        cache.validatedKeys[key] = result;
        saveCache(cache);

        if (result === 'valid') {
            validKeys.push(key);
            writeApiKeys({ generatedAt: '', status: 'validating', candidates: allCandidates, validKeys: [...validKeys] });
        }

        spinner.succeed(`[${marker}] ${key.slice(0, 8)}...  (${result})`);
        await sleep(VALIDATION_DELAY_MS);
    }

    // Finaler Stand
    writeApiKeys({ generatedAt: '', status: 'complete', candidates: allCandidates, validKeys });

    // Delete cache on successful completion
    try { fs.unlinkSync(CACHE_PATH); } catch { /* ignore */ }

    console.log(`\n${validKeys.length} key(s) with remaining quota → ${API_KEYS_PATH} updated`);

    fs.writeFileSync(
        'leaked-keys-report.json',
        JSON.stringify({ scannedAt: new Date().toISOString(), totalCandidates: unique.length, keys: unique }, null, 2)
    );
    console.log('Full report → leaked-keys-report.json');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
