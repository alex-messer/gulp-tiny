const gulp = require('gulp');
const tiny = require('./dist');

const paths = {
	input: 'img/**/*.{png,PNG,jpg,JPG,jpeg,JPEG}',
	output: 'TinyImg',
};

const apiKeys = [
	'8FiQFj9oWwEyTBHMMwxjvuYNx05Fphk2',
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
