var gulp = require('gulp'),
	tiny = require('./index'),
	paths=  {
		input: 'img/**/*.{png,PNG,jpg.JPG,jpeg,JPEG}',
		output: 'TinyImg'
	};

var Api_Key = [
	'8FiQFj9oWwEyTBHMMwxjvuYNx05Fphk2'
];

gulp.task('tiny', function () {
	return gulp.src(paths.input, {since: gulp.lastRun('tiny')})
		.pipe(tiny({
			apiKey : Api_Key,
			cache: false,
			log: false
		}))
		.pipe(gulp.dest(paths.output))
});

gulp.task('default', gulp.series('tiny'));
