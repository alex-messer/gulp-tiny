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

    private _stop(finalText = ''): void {
        if (this.interval) { clearInterval(this.interval); this.interval = null; }
        process.stdout.write(`\r${finalText.padEnd(80)}\n`);
    }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeysFile {
    generatedAt: string;
    status: 'searching' | 'validating' | 'complete';
    candidates: string[];
    validKeys: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TINYPNG_ENDPOINT    = 'https://api.tinypng.com/shrink';
const VALIDATION_DELAY_MS = 500;
const API_KEYS_PATH       = 'api-keys.json';

const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadApiKeys(): ApiKeysFile {
    try {
        return JSON.parse(fs.readFileSync(API_KEYS_PATH, 'utf8')) as ApiKeysFile;
    } catch {
        console.error(`Error: ${API_KEYS_PATH} not found.\nRun "npm run search-keys" first.`);
        process.exit(1);
    }
}

function writeApiKeys(data: ApiKeysFile): void {
    fs.writeFileSync(
        API_KEYS_PATH,
        JSON.stringify({ ...data, generatedAt: new Date().toISOString() }, null, 2)
    );
}

async function validateKey(key: string): Promise<'valid' | 'exhausted' | 'invalid'> {
    try {
        const response = await fetch(TINYPNG_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: 'Basic ' + Buffer.from('api:' + key).toString('base64'),
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
    const existing = loadApiKeys();

    const candidates = [...new Set(existing.candidates)];
    if (candidates.length === 0) {
        console.error(`No candidates found in ${API_KEYS_PATH}.\nRun "npm run search-keys" first.`);
        process.exit(1);
    }

    // Keys already confirmed valid in a previous run — skip re-validation
    const alreadyValid = new Set(existing.validKeys ?? []);
    const toValidate   = candidates.filter((k) => !alreadyValid.has(k));

    console.log(`\nCandidates: ${candidates.length} total`);
    console.log(`Already valid: ${alreadyValid.size} (skipped)`);
    console.log(`To validate:   ${toValidate.length}\n`);

    if (toValidate.length === 0) {
        console.log('Nothing to validate — all candidates already processed.');
        process.exit(0);
    }

    const spinner   = new Spinner();
    const validKeys = [...alreadyValid];
    let invalid     = 0;
    let exhausted   = 0;

    writeApiKeys({ ...existing, status: 'validating', validKeys });

    for (const [i, key] of toValidate.entries()) {
        spinner.start(
            `Validating ${i + 1}/${toValidate.length}: ${key.slice(0, 8)}...` +
            ` | Valid: ${validKeys.length}`
        );

        const result = await validateKey(key);
        const marker = result === 'valid' ? '✓' : result === 'exhausted' ? '~' : '✗';

        if (result === 'valid') {
            validKeys.push(key);
            writeApiKeys({ ...existing, status: 'validating', candidates, validKeys: [...validKeys] });
        } else if (result === 'exhausted') {
            exhausted++;
        } else {
            invalid++;
        }

        spinner.succeed(`[${marker}] ${key.slice(0, 8)}...  (${result})`);
        await sleep(VALIDATION_DELAY_MS);
    }

    writeApiKeys({ ...existing, status: 'complete', candidates, validKeys });

    console.log('\n──────────────────────────────────────');
    console.log(`Valid (quota remaining): ${validKeys.length - alreadyValid.size}`);
    console.log(`Exhausted (429):         ${exhausted}`);
    console.log(`Invalid (401/other):     ${invalid}`);
    console.log(`──────────────────────────────────────`);
    console.log(`Total valid keys now:    ${validKeys.length}`);
    console.log(`\nSaved to ${API_KEYS_PATH}`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
