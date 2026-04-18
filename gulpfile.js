const gulp = require('gulp');
const tiny = require('./dist');

const paths = {
	input: 'img/**/*.{png,PNG,jpg,JPG,jpeg,JPEG}',
	output: 'TinyImg',
};

const apiKeys = [
	'8FiQFj9oWwEyTBHMMwxjvuYNx05Fphk2',
	'K9SK0kgRhqcl56bfDc2XKnC25j0f6qJr',
	'n69cSYDq5W98LtmpcXw8p1qHHdYQQy3M',
	'nSGk2FyphVXCrRY42pnPfTTn5QmSpkx5',
	'fZ2xCNQ76qYVvfPXfDx99jKSypHXFtZc',
	'xpV5SZLs0WvJGWNzkP7sSN3Slj87TsgF',
	'G2MZ4xMKnt8DdwTW426jTyWBM6NdVXgs',
	'KDKRsfNw32Rzz3XvXRFkrrpSVrKymhjm',
	'1MC4FzW84YdsfHHlxGRTNfQ90TSfRb83',
	'8wjs4NP5Y3NP9j4NBxtTrp6JBSsvnKTK',
	'bjtGNk2NMQ8jG3Wr1Hc4RzQDk0s36xFP',
	'WzyZcc6Y3h7FsF3CtJbLTyysCwwkv3vb',
	'mgnLG7Z1Y8j5gfr7LCd53shWLqYfRV1d',
];

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
