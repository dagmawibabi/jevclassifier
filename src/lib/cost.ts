export const GATEWAY_JEV_MODEL = 'typesafe-ai/jev';
export const TYPESAFE_JEV_MODEL = 'jev-latest';
export const JEV_MODEL = GATEWAY_JEV_MODEL;
export const JEV_INPUT_USD_PER_MILLION = 0.042;

export type JevProvider = 'gateway' | 'typesafe';

export function isJevProvider(value: unknown): value is JevProvider {
	return value === 'gateway' || value === 'typesafe';
}

export function modelForProvider(provider: JevProvider, requested?: string) {
	const raw = requested?.trim() ?? '';
	if (provider === 'typesafe') {
		if (!raw || raw === GATEWAY_JEV_MODEL || raw === 'typesafe-ai/jev-latest') return TYPESAFE_JEV_MODEL;
		if (raw.startsWith('typesafe-ai/')) return raw.slice('typesafe-ai/'.length);
		return raw;
	}
	if (!raw || raw === TYPESAFE_JEV_MODEL || raw === 'jev') return GATEWAY_JEV_MODEL;
	if (!raw.includes('/')) return `typesafe-ai/${raw}`;
	return raw;
}

export function costFromUsage(usage: {
	inputTokens?: number;
	outputTokens?: number;
} | undefined) {
	const input = usage?.inputTokens ?? 0;
	return (input / 1_000_000) * JEV_INPUT_USD_PER_MILLION;
}

export function formatUsd(value: number) {
	if (value <= 0) return '$0';
	if (value < 0.0001) return `$${value.toFixed(6)}`;
	if (value < 0.01) return `$${value.toFixed(4)}`;
	return `$${value.toFixed(3)}`;
}

export function formatTokens(value: number | undefined) {
	if (value == null) return '—';
	return value.toLocaleString('en-US');
}
