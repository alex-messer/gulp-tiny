# gulp-tiny

Image compression for [Gulp](https://github.com/gulpjs/gulp) powered by [TinyPNG](https://tinypng.com/).

Written in **TypeScript**, ships with type definitions, targets **Node.js 24 LTS**.

---

## Install

```bash
npm i -D gulp-tiny
```

---

## Usage

### JavaScript

```js
const gulp = require('gulp');
const tiny = require('gulp-tiny');

gulp.task('images', () =>
    gulp.src('img/**/*.{png,jpg,jpeg}', { since: gulp.lastRun('images') })
        .pipe(tiny({
            apiKey: ['YOUR_TINYPNG_API_KEY'],
            cache: true,
            log: true,
        }))
        .pipe(gulp.dest('dist/img')),
);

gulp.task('default', gulp.series('images'));
```

### TypeScript

```ts
import gulp from 'gulp';
import tiny, { GulpTinyOptions } from 'gulp-tiny';

const options: GulpTinyOptions = {
    apiKey: ['YOUR_TINYPNG_API_KEY'],
    cache: true,
    log: true,
};

export const images = () =>
    gulp.src('img/**/*.{png,jpg,jpeg}')
        .pipe(tiny(options))
        .pipe(gulp.dest('dist/img'));
```

---

## Options

| Option    | Type                 | Default    | Description                                                                 |
|-----------|----------------------|------------|-----------------------------------------------------------------------------|
| `apiKey`  | `string \| string[]` | *required* | One or more TinyPNG API keys. Rotated automatically when one is exhausted.  |
| `cache`   | `boolean`            | `false`    | Cache results in `cache/` by MD5 hash — skips re-uploading unchanged files. |
| `log`     | `boolean`            | `false`    | Log compression savings per file to the console.                            |

---

## API key configuration

Keys can be supplied in three ways — all sources are merged and deduplicated:

### 1. Environment variable (`.env.local`)

```bash
cp .env.example .env.local
# add your keys, comma-separated:
TINYPNG_KEYS=yourKey1,yourKey2
```

### 2. Discovered keys (`api-keys.json`)

Run the key search script (see below). It writes validated keys to `api-keys.json`,
which `gulpfile.js` picks up automatically. The file is gitignored.

### 3. Priority order

```
TINYPNG_KEYS (env)  →  api-keys.json  →  merged & deduplicated
```

If no keys are found at all, the gulp task exits with a clear error message.

---

## API key rotation

When a key hits its monthly limit (`429 Too Many Requests`) or is rejected
(`401 Unauthorized`), the plugin automatically switches to the next available
key and retries. The task only fails when **all** keys are exhausted.

```js
tiny({
    apiKey: ['KEY_1', 'KEY_2', 'KEY_3'],
})
```

---

## Caching

With `cache: true`, every compressed image is stored in `cache/` under its
MD5 fingerprint. Subsequent runs skip the TinyPNG API entirely for unchanged
files, saving both time and API quota.

---

## Key search

`gulp-tiny` ships with a script that searches public GitHub repositories for
accidentally exposed TinyPNG API keys, validates them against the TinyPNG API,
and saves the working ones to `api-keys.json`.

### Setup

```bash
cp .env.example .env.local
# set your GitHub personal access token (scope: public_repo):
GITHUB_TOKEN=ghp_yourTokenHere
```

### Run

```bash
npm run search-keys
```

### What it does

| Phase | Description |
|---|---|
| **Search** | Queries GitHub Code Search for 6 TinyPNG-related patterns |
| **Extract** | Fetches each file and scans line-by-line for 32-char alphanumeric keys near TinyPNG keywords |
| **Validate** | POSTs a 1×1 PNG to `api.tinypng.com/shrink` per key — `201` = valid quota |
| **Save** | Writes valid keys to `api-keys.json`; full report to `leaked-keys-report.json` |

`api-keys.json` is created immediately at startup and updated live throughout
the process. A spinner shows the current phase, page count, and key tally in
real time.

---

## Development

### Requirements

- Node.js 24 LTS ([`.nvmrc`](.nvmrc))
- npm 10+

### Scripts

```bash
npm run build          # tsc → dist/
npm test               # vitest
npm run test:watch     # vitest watch mode
npm run coverage       # vitest + v8 coverage report

npm run search-keys    # search GitHub for exposed TinyPNG keys

npm run version:patch  # 2.1.0 → 2.1.1  (bug fix)
npm run version:minor  # 2.1.0 → 2.2.0  (new feature)
npm run version:major  # 2.1.0 → 3.0.0  (breaking change)
```

### Commit convention

This project enforces [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
via `commitlint` + `husky`. Every commit message must follow the format:

```
<type>: <description>

feat:     new feature
fix:      bug fix
chore:    tooling / maintenance
docs:     documentation only
refactor: code change without new feature or fix
```

---

## License

MIT © [Alex Messer](https://github.com/alex-messer)

Original MIT © [Gaurav Jassal](http://gaurav.jassal.me)
