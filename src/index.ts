import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import type Vinyl from 'vinyl';
import PluginError from 'plugin-error';
import log from 'fancy-log';
import colors from 'ansi-colors';

const PLUGIN_NAME = 'gulp-tiny';
const CACHE_DIR = 'cache/';
const TINYPNG_ENDPOINT = 'https://api.tinypng.com/shrink';

export interface GulpTinyOptions {
	apiKey: string | string[];
	cache?: boolean;
	log?: boolean;
}

interface TinifyResult {
	output?: { url?: string };
	error?: string;
	message?: string;
}

class KeyRotator {
	private readonly keys: string[];
	private readonly exhausted = new Set<string>();
	private cursor: number;

	constructor(keys: string[]) {
		this.keys = keys;
		this.cursor = Math.floor(Math.random() * keys.length);
	}

	current(): string | undefined {
		for (let i = 0; i < this.keys.length; i++) {
			const key = this.keys[(this.cursor + i) % this.keys.length];
			if (!this.exhausted.has(key)) {
				this.cursor = (this.cursor + i) % this.keys.length;
				return key;
			}
		}
		return undefined;
	}

	markExhausted(key: string): void {
		this.exhausted.add(key);
		this.cursor = (this.cursor + 1) % this.keys.length;
	}

	allExhausted(): boolean {
		return this.exhausted.size >= this.keys.length;
	}
}

function authHeader(apiKey: string): string {
	return 'Basic ' + Buffer.from('api:' + apiKey).toString('base64');
}

function md5(buf: Buffer): string {
	return createHash('md5').update(buf).digest('hex');
}

function formatBytes(bytes: number): string {
	const units = ['B', 'kB', 'MB', 'GB'];
	const sign = bytes < 0 ? '-' : '';
	let value = Math.abs(bytes);
	let idx = 0;
	while (value >= 1000 && idx < units.length - 1) {
		value /= 1000;
		idx++;
	}
	return `${sign}${value.toFixed(value >= 100 || idx === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[idx]}`;
}

async function ensureCacheDir(): Promise<void> {
	await mkdir(CACHE_DIR, { recursive: true });
}

async function resetCacheDir(): Promise<void> {
	await rm(CACHE_DIR, { recursive: true, force: true });
	await mkdir(CACHE_DIR, { recursive: true });
}

function isQuotaError(status: number, body: TinifyResult): boolean {
	if (status === 401 || status === 429) return true;
	const err = body.error?.toLowerCase();
	return err === 'toomanyrequests' || err === 'unauthorized' || err === 'credentialserror';
}

async function shrink(contents: Buffer, rotator: KeyRotator): Promise<Buffer> {
	while (!rotator.allExhausted()) {
		const apiKey = rotator.current();
		if (!apiKey) break;

		const response = await fetch(TINYPNG_ENDPOINT, {
			method: 'POST',
			headers: {
				'Accept': '*/*',
				'Cache-Control': 'no-cache',
				'Content-Type': 'application/x-www-form-urlencoded',
				'Authorization': authHeader(apiKey),
			},
			body: contents,
		});

		const text = await response.text();
		let result: TinifyResult = {};
		try {
			result = text ? (JSON.parse(text) as TinifyResult) : {};
		} catch {
			result = { message: text };
		}

		if (response.ok && result.output?.url) {
			const downloaded = await fetch(result.output.url);
			if (!downloaded.ok) {
				throw new PluginError(PLUGIN_NAME, `Failed to download optimized image: ${downloaded.status}`);
			}
			return Buffer.from(await downloaded.arrayBuffer());
		}

		if (isQuotaError(response.status, result)) {
			log.warn(
				`${PLUGIN_NAME}: ${colors.yellow('API key exhausted, rotating to the next key.')} ` +
					`(${result.message ?? result.error ?? response.statusText})`,
			);
			rotator.markExhausted(apiKey);
			continue;
		}

		throw new PluginError(
			PLUGIN_NAME,
			result.message ?? result.error ?? `Unexpected response from TinyPNG (${response.status})`,
		);
	}

	throw new PluginError(PLUGIN_NAME, 'All API keys are exhausted or invalid.');
}

function gulpTiny(options: GulpTinyOptions): Transform {
	if (!options || !options.apiKey) {
		throw new PluginError(PLUGIN_NAME, 'Missing api key!');
	}

	const keys = Array.isArray(options.apiKey) ? options.apiKey : [options.apiKey];
	if (keys.length === 0) {
		throw new PluginError(PLUGIN_NAME, 'Missing api key!');
	}

	const cacheEnabled = options.cache === true;
	const shouldLog = options.log === true;
	const rotator = new KeyRotator(keys);

	const cachePrep = cacheEnabled ? ensureCacheDir() : resetCacheDir();

	return new Transform({
		objectMode: true,
		async transform(file: Vinyl, _enc, callback) {
			try {
				await cachePrep;

				if (file.isNull()) {
					return callback(null, file);
				}
				if (file.isStream()) {
					return callback(new PluginError(PLUGIN_NAME, 'Streams are not supported'));
				}
				if (!file.contents || !Buffer.isBuffer(file.contents)) {
					return callback(null, file);
				}

				const previousSize = file.contents.length;
				const fingerprint = md5(file.contents);
				const cachePath = `${CACHE_DIR}${fingerprint}`;

				let optimized: Buffer | undefined;
				if (cacheEnabled) {
					try {
						const { readFile } = await import('node:fs/promises');
						optimized = await readFile(cachePath);
					} catch {
						optimized = undefined;
					}
				}

				if (!optimized) {
					optimized = await shrink(file.contents, rotator);
					if (cacheEnabled) {
						const { writeFile } = await import('node:fs/promises');
						await writeFile(cachePath, optimized);
					}
				}

				file.contents = optimized;

				if (shouldLog) {
					const saved = previousSize - optimized.length;
					const percent = previousSize === 0 ? 0 : ((saved / previousSize) * 100).toFixed(0);
					log(
						`${PLUGIN_NAME}:`,
						colors.green('✔ ') + file.relative + ` (saved ${formatBytes(saved)} - ${percent}%)`,
					);
				}

				callback(null, file);
			} catch (err) {
				const error = err instanceof PluginError ? err : new PluginError(PLUGIN_NAME, err as Error);
				callback(error);
			}
		},
	});
}

export default gulpTiny;
module.exports = gulpTiny;
module.exports.default = gulpTiny;
