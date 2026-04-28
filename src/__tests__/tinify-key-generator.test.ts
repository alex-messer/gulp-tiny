import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

describe('tinify-key-generator: .env integration', () => {
	const testEnvPath = path.join(process.cwd(), '.env.test');

	function saveEnvFile(env: Record<string, string>): void {
		const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
		writeFileSync(testEnvPath, lines.join('\n') + '\n', 'utf-8');
	}

	function loadEnvFile(): Record<string, string> {
		try {
			const content = readFileSync(testEnvPath, 'utf-8');
			const env: Record<string, string> = {};
			content.split('\n').forEach((line) => {
				const trimmed = line.trim();
				if (trimmed && !trimmed.startsWith('#')) {
					const [key, ...valueParts] = trimmed.split('=');
					env[key] = valueParts.join('=');
				}
			});
			return env;
		} catch {
			return {};
		}
	}

	function simulateKeyGeneration(newKey: string, envPath: string = testEnvPath): void {
		const env = loadEnvFile();
		const existingKeys = env.TINYPNG_KEYS ? env.TINYPNG_KEYS.split(',').map((k) => k.trim()) : [];

		if (!existingKeys.includes(newKey)) {
			existingKeys.push(newKey);
		}

		env.TINYPNG_KEYS = existingKeys.join(',');

		const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
		writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
	}

	beforeEach(() => {
		if (existsSync(testEnvPath)) {
			unlinkSync(testEnvPath);
		}
	});

	afterEach(() => {
		if (existsSync(testEnvPath)) {
			unlinkSync(testEnvPath);
		}
	});

	it('should append a new key to empty TINYPNG_KEYS', () => {
		const newKey = 'test_key_12345';
		simulateKeyGeneration(newKey);

		const savedEnv = loadEnvFile();
		assert.equal(savedEnv.TINYPNG_KEYS, 'test_key_12345');
	});

	it('should append a new key to existing TINYPNG_KEYS without duplicates', () => {
		const initialKey = 'existing_key_111';
		const newKey = 'new_key_222';

		let env = { TINYPNG_KEYS: initialKey };
		saveEnvFile(env);

		// Simulate key generation and append
		simulateKeyGeneration(newKey);

		const savedEnv = loadEnvFile();
		assert.equal(savedEnv.TINYPNG_KEYS, 'existing_key_111,new_key_222');
	});

	it('should not add duplicate keys', () => {
		const duplicateKey = 'test_key_333';

		let env = { TINYPNG_KEYS: duplicateKey };
		saveEnvFile(env);

		// Try to add the same key again
		simulateKeyGeneration(duplicateKey);

		const savedEnv = loadEnvFile();
		assert.equal(savedEnv.TINYPNG_KEYS, 'test_key_333');
	});

	it('should create .env file if it does not exist and add first key', () => {
		assert.ok(!existsSync(testEnvPath), '.env.test should not exist before test');

		const newKey = 'first_key_abc123';
		simulateKeyGeneration(newKey);

		assert.ok(existsSync(testEnvPath), '.env.test should exist after key generation');

		const savedEnv = loadEnvFile();
		assert.equal(savedEnv.TINYPNG_KEYS, 'first_key_abc123');
	});

	it('should preserve other env variables when adding keys', () => {
		const initialEnv = {
			GITHUB_TOKEN: 'ghp_test123',
			TINYPNG_KEYS: 'existing_key',
			OTHER_VAR: 'some_value',
		};
		saveEnvFile(initialEnv);

		const newKey = 'new_generated_key';
		simulateKeyGeneration(newKey);

		const savedEnv = loadEnvFile();
		assert.equal(savedEnv.GITHUB_TOKEN, 'ghp_test123');
		assert.equal(savedEnv.TINYPNG_KEYS, 'existing_key,new_generated_key');
		assert.equal(savedEnv.OTHER_VAR, 'some_value');
	});
});
