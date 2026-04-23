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

// Module-level singleton so utility functions can update the spinner text
// without needing it passed as a parameter.
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API         = 'https://api.github.com';
const TINYPNG_ENDPOINT   = 'https://api.tinypng.com/shrink';
const INTER_REQUEST_DELAY_MS = 2000;
const INTER_FILE_DELAY_MS    = 1000;
const VALIDATION_DELAY_MS    = 500;
const KEY_REGEX          = /\b([A-Za-z0-9]{32})\b/g;
const CONTEXT_KEYWORDS   = /tinypng|tinify|apikey|api_key|TINYPNG|TINIFY/i;
const API_KEYS_PATH      = 'api-keys.json';

// Minimales valides 1×1-Pixel-PNG (~68 Bytes) zur Key-Validierung
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
// api-keys.json helpers
// ---------------------------------------------------------------------------

function writeApiKeys(data: ApiKeysFile): void {
    fs.writeFileSync(API_KEYS_PATH, JSON.stringify({ ...data, generatedAt: new Date().toISOString() }, null, 2));
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
            const savedText = spinner.text;
            spinner.text = `${savedText} — Rate limit, warte ${Math.round(waitMs / 1000)}s`;
            await sleep(waitMs);
            spinner.text = savedText;
            continue;
        }

        if (!response.ok) throw new Error(`GitHub API Fehler ${response.status} für ${path}`);

        if (remaining && parseInt(remaining, 10) === 0 && reset) {
            const waitMs = Math.max(0, parseInt(reset, 10) * 1000 - Date.now()) + 1000;
            const savedText = spinner.text;
            spinner.text = `${savedText} — Rate limit erschöpft, warte ${Math.round(waitMs / 1000)}s`;
            await sleep(waitMs);
            spinner.text = savedText;
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
            process.stdout.write(`\n  Fehler auf Seite ${page}: ${err}\n`);
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
            'Fehler: GITHUB_TOKEN ist nicht gesetzt.\n' +
            'Token erstellen: https://github.com/settings/tokens  (Scope: public_repo)\n\n' +
            '  export GITHUB_TOKEN=ghp_deinToken\n' +
            '  npm run search-keys'
        );
        process.exit(1);
    }

    // api-keys.json sofort anlegen
    writeApiKeys({ generatedAt: '', status: 'searching', candidates: [], validKeys: [] });
    console.log(`📄 ${API_KEYS_PATH} erstellt — wird laufend aktualisiert\n`);

    // ── Phase 1: GitHub-Suche ──────────────────────────────────────────────
    const allFiles = new Map<string, CodeSearchItem>();

    for (const query of SEARCH_QUERIES) {
        spinner.start(`Suche: "${query}" | Dateien bisher: ${allFiles.size}`);

        const results = await searchQuery(query, token, (page, total) => {
            spinner.text = `Suche: "${query}" | Seite ${page} | ~${total} Treffer | Dateien: ${allFiles.size}`;
        });

        for (const [url, item] of results) allFiles.set(url, item);
        spinner.succeed(`"${query}" — ${results.size} Dateien gefunden`);
        await sleep(INTER_REQUEST_DELAY_MS);
    }

    // ── Phase 2: Datei-Inhalte abrufen & Keys extrahieren ─────────────────
    const allFoundKeys: FoundKey[] = [];
    let fileIndex = 0;

    for (const [htmlUrl, item] of allFiles) {
        fileIndex++;
        spinner.start(
            `Lade ${fileIndex}/${allFiles.size}: ${item.repository.full_name}/${item.path}` +
            ` | Keys: ${allFoundKeys.length}`
        );

        const rawUrl  = toRawUrl(htmlUrl);
        const content = await fetchFileContent(rawUrl, token);
        await sleep(INTER_FILE_DELAY_MS);

        if (content) {
            const keys = extractCandidateKeys(content, item.path);
            for (const k of keys) {
                k.repo    = item.repository.full_name;
                k.fileUrl = htmlUrl;
                allFoundKeys.push(k);
            }
            if (keys.length > 0) {
                // Alle Kandidaten sofort in api-keys.json schreiben
                const unique = [...new Set(allFoundKeys.map((k) => k.key))];
                writeApiKeys({ generatedAt: '', status: 'searching', candidates: unique, validKeys: [] });
            }
        }
    }

    spinner.succeed(`${allFiles.size} Dateien verarbeitet — ${allFoundKeys.length} Kandidaten`);

    // Deduplizieren
    const seen = new Set<string>();
    const unique = allFoundKeys.filter((k) => {
        const id = `${k.repo}|${k.filePath}|${k.key}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });

    // Tabelle ausgeben
    if (unique.length > 0) {
        const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
        console.log('\n' + col('REPO', 35) + col('DATEI', 30) + col('ZEILE', 6) + col('KEY...', 12) + 'KONTEXT');
        console.log('─'.repeat(100));
        for (const k of unique) {
            console.log(col(k.repo, 35) + col(k.filePath, 30) + col(String(k.line), 6) + col(k.key.slice(0, 8) + '...', 12) + k.context.slice(0, 40));
        }
    }

    // ── Phase 3: Validierung ───────────────────────────────────────────────
    const uniqueKeyStrings = [...new Set(unique.map((k) => k.key))];
    console.log(`\nValidiere ${uniqueKeyStrings.length} einzigartige Key(s) gegen TinyPNG API...`);

    const validKeys: string[] = [];
    const allCandidates = [...new Set(allFoundKeys.map((k) => k.key))];

    writeApiKeys({ generatedAt: '', status: 'validating', candidates: allCandidates, validKeys: [] });

    for (const [i, key] of uniqueKeyStrings.entries()) {
        spinner.start(
            `Validiere ${i + 1}/${uniqueKeyStrings.length}: ${key.slice(0, 8)}...` +
            ` | Valide: ${validKeys.length}`
        );

        const result = await validateKey(key);
        const marker = result === 'valid' ? '✓' : result === 'exhausted' ? '~' : '✗';

        if (result === 'valid') {
            validKeys.push(key);
            writeApiKeys({ generatedAt: '', status: 'validating', candidates: allCandidates, validKeys: [...validKeys] });
        }

        spinner.succeed(`[${marker}] ${key.slice(0, 8)}...  (${result})`);
        await sleep(VALIDATION_DELAY_MS);
    }

    // Finaler Stand in api-keys.json
    writeApiKeys({ generatedAt: '', status: 'complete', candidates: allCandidates, validKeys });

    console.log(`\n${validKeys.length} Key(s) mit verbleibendem Quota → ${API_KEYS_PATH} aktualisiert`);

    // Vollständigen Bericht schreiben
    fs.writeFileSync(
        'leaked-keys-report.json',
        JSON.stringify({ scannedAt: new Date().toISOString(), totalCandidates: unique.length, keys: unique }, null, 2)
    );
    console.log('Vollständiger Bericht → leaked-keys-report.json');
}

main().catch((err) => {
    console.error('Fataler Fehler:', err);
    process.exit(1);
});
