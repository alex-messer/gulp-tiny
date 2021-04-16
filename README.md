# [gulp](https://github.com/creative/gulp-tinypng)-tinypng
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny?ref=badge_shield) [![wakatime](https://wakatime.com/badge/github/EinfachAleks/gulp-tiny.svg)](https://wakatime.com/badge/github/EinfachAleks/gulp-tiny)

Image optimization with [Gulp](https://github.com/gulpjs/gulp) and [TinyPNG](https://tinypng.com/)

## Install
```
npm i -g gulp-tinypng
```

## Usage
```js
var gulp = require('gulp'),
    tiny = require('gulp-tiny'),
    paths = {
		input: 'img/**/*.{png,jpg,jpeg,JPG,PNG,JPEG}',
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
```


## default Options
```
api_Keys = [
    'API_KEY'
]
cached: false
log: false	
```


## TODO
- add the possibility to [Resize Images](https://tinypng.com/developers/reference#request-options)
  - scale
  - fit
  - cover
- rename images with the prefix like that
  - tinyimage-320.jpg
  - tinyimage-480.jpg
  - tinyimage-640.jpg


## License
MIT © [EinfachAleks](https://einfach-aleks.com)

Original MIT © [Gaurav Jassal](http://gaurav.jassal.me)

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FEinfachAleks%2Fgulp-tiny?ref=badge_large)
