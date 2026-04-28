import { generateAndSaveTinifyKey } from './tinify-key-generator.js';
import { isTinifyAutoModeEnabled } from './feature-flags.js';

const command = process.argv[2];

async function main() {
	const autoModeEnabled = isTinifyAutoModeEnabled();

	switch (command) {
		case 'generate-tinify-key':
			if (!autoModeEnabled) {
				console.error('Error: Auto mode is not enabled. Set TINIFY_KEY_MODE=auto to use this command.');
				console.error(`Current mode: github (see: npm run search-keys)`);
				process.exit(1);
			}
			await generateAndSaveTinifyKey();
			break;
		default:
			console.log('Unknown command:', command);
			console.log('Available commands: generate-tinify-key');
			process.exit(1);
	}
}

main().catch((error) => {
	console.error('Error:', error);
	process.exit(1);
});
