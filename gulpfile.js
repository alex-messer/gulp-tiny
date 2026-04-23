require('dotenv').config({ path: '.env', quiet: true });
require('dotenv').config({ path: '.env.local', override: true, quiet: true });

const fs   = require('node:fs');
const gulp = require('gulp');
const tiny = require('./dist');

const paths = {
	input: 'img/**/*.{png,PNG,jpg,JPG,jpeg,JPEG}',
	output: 'TinyImg',
};

// 1) Keys from environment variable (comma-separated)
const envKeys = (process.env.TINYPNG_KEYS || '')
	.split(',')
	.map(k => k.trim())
	.filter(Boolean);

// 2) Keys discovered by the search script (gitignored, temporary)
let discoveredKeys = [];
try {
	const data = JSON.parse(fs.readFileSync('api-keys.json', 'utf8'));
	discoveredKeys = Array.isArray(data.validKeys) ? data.validKeys : [];
} catch { /* file does not exist — no problem */ }

// Merge and deduplicate
const apiKeys = [...new Set([...envKeys, ...discoveredKeys])];

if (apiKeys.length === 0) {
	console.error(
		'No TinyPNG API keys found.\n' +
		'Options:\n' +
		'  1. Add TINYPNG_KEYS=key1,key2 to .env.local\n' +
		'  2. Run npm run search-keys to generate api-keys.json'
	);
	process.exit(1);
}

gulp.task('tiny', function () {
	return gulp
		.src(paths.input, { since: gulp.lastRun('tiny') })
		.pipe(
			tiny({
				apiKey: apiKeys,
				cache: false,
				log: true,
			}),
		)
		.pipe(gulp.dest(paths.output));
});

gulp.task('default', gulp.series('tiny'));
