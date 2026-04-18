# [gulp](https://github.com/creative/gulp-tinypng)-tiny
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny?ref=badge_shield) [![wakatime](https://wakatime.com/badge/github/EinfachAleks/gulp-tiny.svg)](https://wakatime.com/badge/github/EinfachAleks/gulp-tiny)

Image optimization with [Gulp](https://github.com/gulpjs/gulp) and [TinyPNG](https://tinypng.com/).

Written in **TypeScript**, ships with type definitions, and targets **Node.js 18+**.

## Install
```
npm i -D gulp-tiny
```

## Usage (JavaScript)
```js
const gulp = require('gulp');
const tiny = require('gulp-tiny');

const paths = {
    input: 'img/**/*.{png,jpg,jpeg,JPG,PNG,JPEG}',
    output: 'TinyImg',
};

const apiKeys = [
    'YOUR_TINYPNG_API_KEY',
];

gulp.task('tiny', () =>
    gulp.src(paths.input, { since: gulp.lastRun('tiny') })
        .pipe(tiny({
            apiKey: apiKeys,
            cache: false,
            log: true,
        }))
        .pipe(gulp.dest(paths.output)),
);

gulp.task('default', gulp.series('tiny'));
```

## Usage (TypeScript)
```ts
import gulp from 'gulp';
import tiny, { GulpTinyOptions } from 'gulp-tiny';

const options: GulpTinyOptions = {
    apiKey: ['YOUR_TINYPNG_API_KEY'],
    cache: true,
    log: true,
};

export const tinypng = () =>
    gulp.src('img/**/*.{png,jpg,jpeg}').pipe(tiny(options)).pipe(gulp.dest('TinyImg'));
```

## Options

| Option   | Type                    | Default  | Description                                                                 |
| -------- | ----------------------- | -------- | --------------------------------------------------------------------------- |
| `apiKey` | `string \| string[]`    | required | One or more TinyPNG API keys. Keys rotate automatically when one is out.    |
| `cache`  | `boolean`               | `false`  | Cache compressed images in `cache/` keyed by MD5 to avoid re-uploading.     |
| `log`    | `boolean`               | `false`  | Pretty-print savings per file.                                              |

### Automatic API key rotation
When a key is exhausted (`429 Too Many Requests`) or unauthorized, the plugin
marks it as used for the run and transparently retries the request with the
next available key. The run only fails if **every** key is exhausted.

## Build from source
```
npm install
npm run build
```

Compiles `src/index.ts` → `dist/index.js` with declaration files.

## License
MIT © [EinfachAleks](https://einfach-aleks.com)

Original MIT © [Gaurav Jassal](http://gaurav.jassal.me)

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny?ref=badge_large)
