# gulp-tiny

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny?ref=badge_shield)

Image compression for [Gulp](https://github.com/gulpjs/gulp) powered by [TinyPNG](https://tinypng.com/).

Written in **TypeScript**, ships with type definitions, targets **Node.js 18+**.

## Install

```bash
npm i -D gulp-tiny
```

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

## Options

| Option    | Type                 | Default    | Description                                                              |
|-----------|----------------------|------------|--------------------------------------------------------------------------|
| `apiKey`  | `string \| string[]` | *required* | One or more TinyPNG API keys.                                            |
| `cache`   | `boolean`            | `false`    | Cache results in `cache/` by MD5 hash — skips re-uploading unchanged files. |
| `log`     | `boolean`            | `false`    | Log savings per file to the console.                                     |

## API key rotation

Pass an array of API keys to `apiKey`. When a key hits its monthly limit
(`429 Too Many Requests`) or is rejected (`401 Unauthorized`), the plugin
automatically switches to the next key and retries. The task only fails when
**all** keys are exhausted.

```js
tiny({
    apiKey: [
        'KEY_1',
        'KEY_2',
        'KEY_3',
    ],
})
```

## Caching

With `cache: true`, every compressed image is stored in `cache/` under its
MD5 fingerprint. Subsequent runs skip the TinyPNG API entirely for files that
have not changed, saving both time and API quota.

## Build from source

```bash
npm install
npm run build   # tsc → dist/
npm test        # vitest
npm run coverage
```

## License

MIT © [Alex Messer](https://github.com/alex-messer)

Original MIT © [Gaurav Jassal](http://gaurav.jassal.me)

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny?ref=badge_large)
