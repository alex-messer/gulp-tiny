export type TinifyKeyMode = 'github' | 'auto';

export interface FeatureFlags {
	tinifyKeyMode: TinifyKeyMode;
}

function getTinifyKeyMode(): TinifyKeyMode {
	const mode = process.env.TINIFY_KEY_MODE?.toLowerCase();
	if (mode === 'auto' || mode === 'github') {
		return mode as TinifyKeyMode;
	}
	// Default to 'github' if not specified or invalid
	return 'github';
}

export function getFeatureFlags(): FeatureFlags {
	return {
		tinifyKeyMode: getTinifyKeyMode(),
	};
}

export function isTinifyAutoModeEnabled(): boolean {
	return getTinifyKeyMode() === 'auto';
}
