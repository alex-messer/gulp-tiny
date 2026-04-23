require('dotenv').config({ path: '.env', quiet: true });
require('dotenv').config({ path: '.env.local', override: true, quiet: true });

const fs   = require('node:fs');
const gulp = require('gulp');
const tiny = require('./dist');

const paths = {
	input: 'img/**/*.{png,PNG,jpg,JPG,jpeg,JPEG}',
	output: 'TinyImg',
};

// 1) Eigene Keys aus Umgebungsvariable (Komma-getrennt)
const envKeys = (process.env.TINYPNG_KEYS || '')
	.split(',')
	.map(k => k.trim())
	.filter(Boolean);

// 2) Gefundene Keys aus api-keys.json (temporär, gitignored)
let discoveredKeys = [];
try {
	const data = JSON.parse(fs.readFileSync('api-keys.json', 'utf8'));
	discoveredKeys = Array.isArray(data.keys) ? data.keys : [];
} catch { /* Datei existiert nicht – kein Problem */ }

// Zusammenführen, deduplizieren
const apiKeys = [...new Set([...envKeys, ...discoveredKeys])];

if (apiKeys.length === 0) {
	console.error(
		'Keine TinyPNG API-Keys gefunden.\n' +
		'Optionen:\n' +
		'  1. TINYPNG_KEYS=key1,key2 in .env.local eintragen\n' +
		'  2. npm run search-keys ausführen (generiert api-keys.json)'
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
