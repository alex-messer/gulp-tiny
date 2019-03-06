// through2 is a thin wrapper around node transform streams
var through = require('through2'),
	prettyBytes = require('pretty-bytes'),
	gutil = require('gulp-util'),
	mkdirp = require('mkdirp'),
	rmdir = require('rmdir'),
	request = require('request'),
	fs = require('fs'),
	md5 = require('md5'),
	PluginError = gutil.PluginError,
	AUTH_TOKEN,
	cached = true,
	log = true;

// Consts
var PLUGIN_NAME = 'gulp-tiny';
var CACHE = 'cache/';

function prefixStream(prefixText) {
	var stream = through();
	stream.write(prefixText);
	return stream;
}

var createTempDir = function () {
	fs.access(CACHE, fs.F_OK, function (err) {
		if (err) {
			mkdirp(CACHE, function (err) {
				if (err) {
					console.error('Error creating temp folder');
				}
			});
		}
	});
};

var cleanTemp = function () {
	rmdir(CACHE, function (err, dirs, files) {
		mkdirp(CACHE, function (err) {
			if (err) {
				console.error('Error creating temp folder');
			}
		});
	});
};

var download = function (uri, filename, complete) {
	request.head(uri, function (err, res, body) {
		request({
			url: uri,
			strictSSL: false
		})
			.pipe(fs.createWriteStream(CACHE + filename))
			.on('close', function () {
				complete();
			});
	});
};

var readTemp = function (filename, cb) {
	fs.readFile(CACHE + filename, function (err, data) {
		if (err) {
			return cb(new PluginError(PLUGIN_NAME, err));
		}
		cb(null, data);
	});
};

function RandomNumm(min, max) {
	var range = max - min,
		rand = Math.random(),
		nummer = min + Math.floor(rand * range);
	return nummer;
}

// Plugin level function (dealing with files)
function gulpPrefixer(options) {
	var apiKey = options.apiKey;
	var cached = options.cache;
	var log = options.log;

	apiKey = apiKey[RandomNumm(0, apiKey.length)];
	AUTH_TOKEN = new Buffer('api:' + apiKey).toString('base64');

	if (!apiKey) {
		throw new PluginError(PLUGIN_NAME, "Missing api key!");
	}
	if (!cached) {
		cleanTemp();
	} else {
		createTempDir();
	}

	var stream = through.obj(function (file, enc, callback) {
		if (file.isNull()) {
			this.push(file);
			return callback();
		}

		if (file.isBuffer()) {
			var prevLength = file.contents.length;
			tinypng(file, function (data) {
				file.contents = data;
				this.push(file);
				if (log) {
					gutil.log(PLUGIN_NAME + ':', gutil.colors.green('✔ ') + file.relative + ' (saved ' + prettyBytes(prevLength - data.length) + ' - ' + ((1 - data.length / prevLength) * 100).toFixed(0) + '%)');
				}
				return callback();
			}.bind(this));
		}

		if (file.isStream()) {
			throw new PluginError(PLUGIN_NAME, "Stream is not supported");
			return callback();
		}
	});

	return stream;
}

var tinyNewPng = function (file, cb) {
	request({
		url: 'https://api.tinypng.com/shrink',
		method: 'POST',
		strictSSL: false,
		headers: {
			'Accept': '*/*',
			'Cache-Control': 'no-cache',
			'Content-Type': 'application/x-www-form-urlencoded',
			'Authorization': 'Basic ' + AUTH_TOKEN
		},
		body: file.contents
	}, function (error, response, body) {
		var results, filename;
		if (!error) {
			filename = md5(file.contents);
			results = JSON.parse(body);
			if (results.output && results.output.url) {
				download(results.output.url, filename, function () {
					fs.readFile(CACHE + filename, function (err, data) {
						if (err) {
							gutil.log('[error] : ' + PLUGIN_NAME + ' - ', err);
						}
						cb(data);
					});
				});
			} else {
				gutil.log('[error] : ' + PLUGIN_NAME + ' - ', results.message);
			}
		}
	});
};

function tinypng(file, cb) {
	var tmpFileName = md5(file.contents);
	readTemp(tmpFileName, function (err, tmpFile) {
		if (!err) {
			cb(tmpFile);
		} else {
			tinyNewPng(file, function (data) {
				cb(data);
			})
		}
	})
}

module.exports = gulpPrefixer;
