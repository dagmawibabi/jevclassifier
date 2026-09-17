import raw from './data/dictionary.json';

export type DictEntry = { key: string; word: string; definition: string };

export type ChoiceKind = 'eos' | 'punct' | 'word' | 'bucket';

export type ChoiceMeta = {
	kind: ChoiceKind;
	label: string;
	word?: string;
	start?: number;
	end?: number;
};

export const DICTIONARY = raw as DictEntry[];

const CORE_WORDS = [
	'a',
	'about',
	'after',
	'all',
	'also',
	'am',
	'an',
	'and',
	'any',
	'are',
	'as',
	'at',
	'be',
	'because',
	'been',
	'but',
	'by',
	'can',
	'could',
	'did',
	'do',
	'does',
	'down',
	'for',
	'from',
	'get',
	'give',
	'go',
	'good',
	'had',
	'has',
	'have',
	'he',
	'hello',
	'help',
	'her',
	'here',
	'hey',
	'hi',
	'him',
	'his',
	'how',
	'i',
	'if',
	'in',
	'into',
	'is',
	'it',
	'just',
	'know',
	'like',
	'me',
	'more',
	'my',
	'need',
	'no',
	'not',
	'now',
	'of',
	'ok',
	'okay',
	'on',
	'one',
	'or',
	'our',
	'out',
	'please',
	'really',
	'right',
	'so',
	'some',
	'sorry',
	'than',
	'that',
	'the',
	'their',
	'them',
	'then',
	'there',
	'they',
	'think',
	'this',
	'to',
	'too',
	'up',
	'us',
	'want',
	'we',
	'well',
	'what',
	'when',
	'where',
	'which',
	'who',
	'why',
	'will',
	'with',
	'would',
	'yes',
	'you',
	'your'
];

const CONTROLS: {
	key: string;
	kind: Exclude<ChoiceKind, 'word' | 'bucket'>;
	word: string;
	definition: string;
}[] = [
	{
		key: '__eos',
		kind: 'eos',
		word: '',
		definition:
			'STOP. End-of-reply character. Use this to finish. The draft becomes the full assistant message. Prefer STOP after a greeting or a complete sentence.'
	},
	{ key: '__period', kind: 'punct', word: '.', definition: 'Period. End the current sentence.' },
	{ key: '__comma', kind: 'punct', word: ',', definition: 'Comma. Pause inside the sentence.' },
	{ key: '__question', kind: 'punct', word: '?', definition: 'Question mark. End a question.' },
	{
		key: '__exclaim',
		kind: 'punct',
		word: '!',
		definition: 'Exclamation mark. End an emphatic sentence.'
	}
];

export const JEV_CHOICE_LIMIT = 255;
export const STOP_LABEL = 'STOP';

const byWord = new Map<string, DictEntry>();
for (const entry of DICTIONARY) {
	const word = entry.word.toLowerCase();
	if (!byWord.has(word)) byWord.set(word, entry);
}

export const CORE_ENTRIES = CORE_WORDS.map((word) => byWord.get(word)).filter(
	(entry): entry is DictEntry => entry != null
);
const CORE_KEY = new Set(CORE_ENTRIES.map((entry) => entry.key));

export const NEXT_WORD_INSTRUCTIONS = `Pick the next token of the assistant reply.
STOP is the stop character: it ends the reply. Use STOP when the draft already answers the user, after a short greeting (hi/hello/hey), or after a finished sentence.
Common words are listed individually with definitions. Prefer those.
Dictionary spans are uncommon leftover words, alphabetical. Pick a span only if the next word is not in the common list and not STOP.
Do not repeat a content word already used in the draft. Never emit the same word twice in a row.
Empty draft: start the reply, never STOP yet.`;

export const COMPLETE_INSTRUCTIONS = `True if the assistant draft is already a finished reply the user can read.
False if the draft is empty.
True if the draft is a greeting that has already been said (hello, hi, hey).
True if the draft already ends with . ! or ?.
True if the draft is looping or repeating the same word.
True if a short, grammatical answer is already on the page.`;

function clip(text: string) {
	return text.replace(/\s+/g, ' ').trim().slice(0, 110);
}

export function buildChoice(slice: DictEntry[], banned: string[] = []) {
	const criteria: Record<string, string> = {};
	const meta: Record<string, ChoiceMeta> = {};
	const bannedSet = new Set(banned.map((word) => word.toLowerCase()));
	const topLevel = slice.length === DICTIONARY.length;

	for (const item of CONTROLS) {
		criteria[item.key] = item.definition;
		meta[item.key] = {
			kind: item.kind,
			label: item.kind === 'eos' ? STOP_LABEL : item.word,
			word: item.word
		};
	}

	const addWord = (entry: DictEntry) => {
		if (bannedSet.has(entry.word.toLowerCase())) return;
		if (criteria[entry.key]) return;
		criteria[entry.key] = `${entry.word}: ${clip(entry.definition)}`;
		meta[entry.key] = { kind: 'word', label: entry.word, word: entry.word };
	};

	if (topLevel) {
		for (const entry of CORE_ENTRIES) addWord(entry);
	}

	const remaining = slice.filter((entry) => {
		if (bannedSet.has(entry.word.toLowerCase())) return false;
		if (topLevel && CORE_KEY.has(entry.key)) return false;
		return true;
	});

	const used = Object.keys(criteria).length;
	const budget = Math.max(8, JEV_CHOICE_LIMIT - used);

	if (remaining.length <= budget) {
		for (const entry of remaining) addWord(entry);
	} else {
		const size = Math.ceil(remaining.length / budget);
		for (let start = 0; start < remaining.length; start += size) {
			const end = Math.min(remaining.length, start + size);
			const first = remaining[start];
			const last = remaining[end - 1];
			if (!first || !last) continue;
			const key = `g_${start}_${end}`;
			criteria[key] =
				`Uncommon dictionary span ${first.word} (“${clip(first.definition)}”) through ${last.word} (“${clip(last.definition)}”). ${end - start} rare entries. Only if the next word is not a common word and not STOP.`;
			meta[key] = {
				kind: 'bucket',
				label: `${first.word}–${last.word}`,
				start,
				end
			};
		}
	}

	return { criteria, meta, remaining };
}

export function topChoices(
	probabilities: Record<string, number> | undefined,
	meta: Record<string, ChoiceMeta>,
	limit = 15
) {
	const rows = Object.entries(probabilities ?? {})
		.map(([key, value]) => ({ key, value, label: meta[key]?.label ?? key }))
		.sort((a, b) => b.value - a.value)
		.slice(0, limit);
	return rows.map((row) => ({ key: row.label, value: row.value }));
}

export function completeThreshold(input: {
	empty: boolean;
	sentenceComplete: boolean;
	consecutiveRepeat: boolean;
	wordCount: number;
}) {
	if (input.empty) return 1.1;
	if (input.consecutiveRepeat) return 0.15;
	if (input.sentenceComplete) return 0.32;
	if (input.wordCount >= 8) return 0.42;
	if (input.wordCount >= 4) return 0.55;
	return 0.8;
}
