export type ChatTurn = { role: 'user' | 'assistant'; text: string };

const PUNCT = new Set(['.', ',', '?', '!', ':', ';']);

const FUNCTION_WORDS = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'be',
	'but',
	'for',
	'from',
	'i',
	'in',
	'is',
	'it',
	'not',
	'of',
	'on',
	'or',
	'that',
	'the',
	'this',
	'to',
	'we',
	'you'
]);

export function appendToken(draft: string, word: string) {
	if (!word) return draft;
	if (PUNCT.has(word)) return draft + word;
	let surface = word;
	const startSentence = !draft.trim() || /[.!?]\s*$/.test(draft);
	if (surface.toLowerCase() === 'i') surface = 'I';
	if (startSentence) surface = surface.charAt(0).toUpperCase() + surface.slice(1);
	if (!draft) return surface;
	if (/\s$/.test(draft)) return draft + surface;
	return `${draft} ${surface}`;
}

export function tokenizeDraft(draft: string) {
	return (draft.match(/[a-zA-Z']+|[.!,?;:]/g) ?? []).map((token) => token.toLowerCase());
}

export function analyzeDraft(draft: string) {
	const tokens = tokenizeDraft(draft);
	const last = tokens.at(-1) ?? '';
	const prev = tokens.at(-2) ?? '';
	const counts = new Map<string, number>();
	for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
	const wordCount = tokens.filter((token) => !PUNCT.has(token)).length;
	const banned = [...counts.entries()]
		.filter(([word, count]) => count >= 1 && !FUNCTION_WORDS.has(word) && !PUNCT.has(word))
		.map(([word]) => word);
	return {
		tokens,
		last,
		wordCount,
		consecutiveRepeat: Boolean(last && last === prev && !PUNCT.has(last)),
		repeatCount: last ? (counts.get(last) ?? 0) : 0,
		sentenceComplete: /[.!?]\s*$/.test(draft.trim()),
		banned
	};
}

export function lastUserMessage(turns: ChatTurn[]) {
	for (let index = turns.length - 1; index >= 0; index--) {
		if (turns[index]?.role === 'user') return turns[index].text;
	}
	return '';
}

export function formatConversation(turns: ChatTurn[], draft: string) {
	const lines = turns.map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`);
	lines.push(`Assistant draft so far: ${draft.trim() ? draft : '(empty — start the reply)'}`);
	return lines.join('\n');
}
