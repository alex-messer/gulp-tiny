import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MAIL_TM_API = 'https://api.mail.tm';
const TINIFY_REGISTER_URL = 'https://tinify.com/developers';
const TINIFY_DASHBOARD_URL = 'https://tinify.com/dashboard';

interface MailTmAccount {
	address: string;
	password: string;
}

async function createMailTmAccount(): Promise<MailTmAccount> {
	const domain = await getMailTmDomain();
	const address = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}@${domain}`;
	const password = Math.random().toString(36).substring(2, 15);

	const response = await fetch(`${MAIL_TM_API}/accounts`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ address, password }),
	});

	if (!response.ok) {
		throw new Error(`Failed to create mail.tm account: ${response.statusText}`);
	}

	return { address, password };
}

async function getMailTmDomain(): Promise<string> {
	const response = await fetch(`${MAIL_TM_API}/domains`);
	if (!response.ok) {
		throw new Error('Failed to fetch mail.tm domains');
	}

	const data = (await response.json()) as { hydra: { member: Array<{ domain: string }> } };
	const domain = data.hydra?.member?.[0]?.domain;
	if (!domain) {
		throw new Error('No mail.tm domain available');
	}

	return domain;
}

async function getMailTmMessages(account: MailTmAccount, token: string): Promise<Array<{ id: string; subject: string }>> {
	const response = await fetch(`${MAIL_TM_API}/messages`, {
		headers: { Authorization: `Bearer ${token}` },
	});

	if (!response.ok) {
		throw new Error('Failed to fetch messages from mail.tm');
	}

	const data = (await response.json()) as { hydra: { member: Array<{ id: string; subject: string }> } };
	return data.hydra?.member || [];
}

async function getMailTmMessage(id: string, token: string): Promise<{ html: string }> {
	const response = await fetch(`${MAIL_TM_API}/messages/${id}`, {
		headers: { Authorization: `Bearer ${token}` },
	});

	if (!response.ok) {
		throw new Error('Failed to fetch message from mail.tm');
	}

	return (await response.json()) as { html: string };
}

async function getMailTmToken(account: MailTmAccount): Promise<string> {
	const response = await fetch(`${MAIL_TM_API}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ address: account.address, password: account.password }),
	});

	if (!response.ok) {
		throw new Error('Failed to authenticate with mail.tm');
	}

	const data = (await response.json()) as { token: string };
	return data.token;
}

function extractDashboardUrl(htmlContent: string): string | null {
	const match = htmlContent.match(/href=["']([^"']*visit[^"']*dashboard[^"']*|[^"']*dashboard[^"']*visit[^"']*|https:\/\/tinify\.com\/dashboard\/[^"']*)/i);
	return match ? match[1] : null;
}

function generateRandomName(): string {
	const adjectives = ['happy', 'clever', 'swift', 'bright', 'keen'];
	const nouns = ['panda', 'eagle', 'tiger', 'wolf', 'fox'];
	const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
	const noun = nouns[Math.floor(Math.random() * nouns.length)];
	const num = Math.floor(Math.random() * 10000);
	return `${adj}${noun}${num}`;
}

async function extractKeyFromDashboard(page: any): Promise<string> {
	// Wait for the Available API keys section
	await page.waitForSelector('.key', { timeout: 10000 });

	// Find the key element with ID and extract the value from the p tag
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const keyElement = (await page.evaluate(() => {
		// @ts-ignore - document is available in browser context
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const keyDivs = (document as any).querySelectorAll('.key');
		for (const div of keyDivs) {
			const idAttr = div.id;
			if (idAttr) {
				const pTag = div.querySelector('p');
				if (pTag) {
					return pTag.textContent?.trim() || null;
				}
			}
		}
		return null;
	})) as string | null;

	return keyElement || '';
}

export async function generateTinifyKey(): Promise<string> {
	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		console.log('Creating temporary mail.tm account...');
		const mailAccount = await createMailTmAccount();
		console.log(`✓ Mail account created: ${mailAccount.address}`);

		const randomName = generateRandomName();
		console.log(`Registering Tinify account as: ${randomName}`);

		// Navigate to Tinify registration
		await page.goto(TINIFY_REGISTER_URL, { waitUntil: 'networkidle' });

		// Fill registration form
		await page.fill('input[type="email"]', mailAccount.address);
		await page.fill('input[type="text"]', randomName);
		await page.fill('input[type="password"]', 'TempPass123!@#');

		// Submit registration
		await Promise.all([
			page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
			page.click('button[type="submit"]'),
		]);

		console.log('✓ Registration submitted');

		// Wait for email
		console.log('Waiting for confirmation email...');
		const token = await getMailTmToken(mailAccount);
		let dashboardUrl = null;
		let attempts = 0;
		const maxAttempts = 30;

		while (!dashboardUrl && attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			const messages = await getMailTmMessages(mailAccount, token);
			const confirmEmail = messages.find((msg) => msg.subject.toLowerCase().includes('confirm') || msg.subject.toLowerCase().includes('verify'));

			if (confirmEmail) {
				const message = await getMailTmMessage(confirmEmail.id, token);
				dashboardUrl = extractDashboardUrl(message.html);
			}

			attempts++;
		}

		if (!dashboardUrl) {
			throw new Error('Could not find dashboard URL in confirmation email after 30 attempts');
		}

		console.log('✓ Confirmation email received');

		// Navigate to dashboard
		console.log('Visiting dashboard...');
		await page.goto(dashboardUrl, { waitUntil: 'networkidle' });

		// Wait for API keys section and enable key
		console.log('Looking for Available API keys section...');
		await page.waitForSelector('.three-dots', { timeout: 10000 });

		// Hover over three dots menu
		const threeDots = await page.locator('.three-dots').first();
		await threeDots.hover();

		// Wait for popup menu and click Enable key
		await page.waitForSelector('.popup-menu', { timeout: 5000 });
		const enableKeyButton = await page.locator('.popup-menu button, .popup-menu a').filter({ hasText: /enable|activate/i }).first();

		if (enableKeyButton) {
			await enableKeyButton.click();
			await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 });
		}

		// Extract the API key
		console.log('Extracting API key...');
		const apiKey = await extractKeyFromDashboard(page);

		if (!apiKey) {
			throw new Error('Could not extract API key from dashboard');
		}

		console.log(`✓ API key generated: ${apiKey.substring(0, 8)}...`);
		return apiKey;
	} finally {
		await browser.close();
	}
}

function loadEnvFile(): Record<string, string> {
	const envPath = path.join(process.cwd(), '.env');
	try {
		const content = readFileSync(envPath, 'utf-8');
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

function saveEnvFile(env: Record<string, string>): void {
	const envPath = path.join(process.cwd(), '.env');
	const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
	writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
}

export async function generateAndSaveTinifyKey(): Promise<void> {
	try {
		const apiKey = await generateTinifyKey();
		const env = loadEnvFile();

		// Add key to TINYPNG_KEYS
		const existingKeys = env.TINYPNG_KEYS ? env.TINYPNG_KEYS.split(',').map((k) => k.trim()) : [];
		if (!existingKeys.includes(apiKey)) {
			existingKeys.push(apiKey);
		}

		env.TINYPNG_KEYS = existingKeys.join(',');
		saveEnvFile(env);

		console.log(`✓ Key saved to .env: TINYPNG_KEYS`);
	} catch (error) {
		console.error('✗ Failed to generate and save Tinify key:', error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
