import { isJevProvider, type JevProvider } from '$lib/cost';

const GATEWAY_STORAGE_KEY = 'classify.gateway.apiKey';
const TYPESAFE_STORAGE_KEY = 'classify.typesafe.apiKey';
const PROVIDER_STORAGE_KEY = 'classify.jev.provider.v1';

export const keyUi = $state({
	open: false,
	provider: 'gateway' as JevProvider,
	hasGatewayEnv: false,
	hasTypesafeEnv: false,
	hasGatewayLocal: false,
	hasTypesafeLocal: false
});

export function loadProvider(): JevProvider {
	if (typeof localStorage === 'undefined') return 'gateway';
	const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
	return isJevProvider(stored) ? stored : 'gateway';
}

export function saveProvider(provider: JevProvider) {
	localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
	keyUi.provider = provider;
}

function storageKey(provider: JevProvider) {
	return provider === 'typesafe' ? TYPESAFE_STORAGE_KEY : GATEWAY_STORAGE_KEY;
}

export function loadApiKey(provider: JevProvider = keyUi.provider) {
	if (typeof localStorage === 'undefined') return '';
	return localStorage.getItem(storageKey(provider))?.trim() ?? '';
}

export function saveApiKey(provider: JevProvider, value: string) {
	const key = value.trim();
	if (!key) localStorage.removeItem(storageKey(provider));
	else localStorage.setItem(storageKey(provider), key);
	if (provider === 'typesafe') keyUi.hasTypesafeLocal = Boolean(key);
	else keyUi.hasGatewayLocal = Boolean(key);
}

export function clearApiKey(provider: JevProvider = keyUi.provider) {
	saveApiKey(provider, '');
}

export function classifyAuthHeaders(): Record<string, string> {
	const provider = keyUi.provider;
	const headers: Record<string, string> = { 'x-jev-provider': provider };
	const key = loadApiKey(provider);
	if (key) headers.authorization = `Bearer ${key}`;
	return headers;
}

export async function refreshGatewayStatus() {
	keyUi.hasGatewayLocal = Boolean(loadApiKey('gateway'));
	keyUi.hasTypesafeLocal = Boolean(loadApiKey('typesafe'));
	try {
		const response = await fetch('/api/gateway');
		const payload = (await response.json()) as {
			gatewayEnv?: boolean;
			typesafeEnv?: boolean;
			defaultProvider?: string;
			serverKey?: boolean;
		};
		keyUi.hasGatewayEnv = Boolean(payload.gatewayEnv ?? payload.serverKey);
		keyUi.hasTypesafeEnv = Boolean(payload.typesafeEnv);
		const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(PROVIDER_STORAGE_KEY);
		keyUi.provider = isJevProvider(stored)
			? stored
			: isJevProvider(payload.defaultProvider)
				? payload.defaultProvider
				: keyUi.hasTypesafeEnv
					? 'typesafe'
					: 'gateway';
	} catch {
		keyUi.hasGatewayEnv = false;
		keyUi.hasTypesafeEnv = false;
		keyUi.provider = loadProvider();
	}
}
