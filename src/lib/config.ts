import { CATEGORIES } from './taxonomy';
import { JEV_MODEL } from './cost';

export type ChoiceOption = { key: string; description: string };

export type ChoiceQuestion = {
	id: string;
	label: string;
	enabled: boolean;
	type: 'choice';
	instructions: string;
	options: ChoiceOption[];
};

export type ScoreQuestion = {
	id: string;
	label: string;
	enabled: boolean;
	type: 'score';
	instructions: string;
	levels: string[];
};

export type BooleanQuestion = {
	id: string;
	label: string;
	enabled: boolean;
	type: 'boolean';
	instructions: string;
	trueDescription: string;
	falseDescription: string;
};

export type QuestionConfig = ChoiceQuestion | ScoreQuestion | BooleanQuestion;

export type RunConfig = {
	version: 1;
	model: string;
	concurrency: number;
	maxRetries: number;
	zeroDataRetention: boolean;
	questions: QuestionConfig[];
};

export type JevQuestion =
	| { type: 'choice'; instructions: string; criteria: Record<string, string> }
	| { type: 'score'; instructions: string; criteria: string[] }
	| {
			type: 'boolean';
			instructions: string;
			criteria?: { true?: string; false?: string };
	  };

const STORAGE_KEY = 'classify.jev.config.v1';
const CHAT_STORAGE_KEY = 'classify.jev.chat-config.v1';

export function defaultConfig(): RunConfig {
	return {
		version: 1,
		model: JEV_MODEL,
		concurrency: 3,
		maxRetries: 2,
		zeroDataRetention: false,
		questions: [
			{
				id: 'category',
				label: 'What it is',
				enabled: true,
				type: 'choice',
				instructions:
					'Classify this Telegram channel post by its primary intent. Use the post text. If the text is empty, infer from media type and metadata. Pick one category.',
				options: Object.entries(CATEGORIES).map(([key, description]) => ({ key, description }))
			},
			{
				id: 'quality',
				label: 'How good it is',
				enabled: true,
				type: 'score',
				instructions:
					'Grade editorial quality for a public channel: clarity, substance, originality, and usefulness. Ignore emoji density. Low is spam, empty, or incoherent. Medium is acceptable but thin. High is specific, well-written, and worth keeping.',
				levels: [
					'Low: empty, spam, unreadable, or no lasting value.',
					'Medium: understandable but generic or incomplete.',
					'High: clear, useful, and worth publishing.'
				]
			},
			{
				id: 'sentiment',
				label: 'Post sentiment',
				enabled: true,
				type: 'choice',
				instructions:
					'Classify the emotional tone of the post text itself, not the reactions. Neutral is factual, promotional, or instructional with little affect.',
				options: [
					{ key: 'positive', description: 'Upbeat, encouraging, grateful, or celebratory.' },
					{ key: 'neutral', description: 'Matter-of-fact, mixed, or no clear valence.' },
					{ key: 'negative', description: 'Critical, sad, angry, fearful, or complaining.' }
				]
			},
			{
				id: 'reaction',
				label: 'Reaction tone',
				enabled: true,
				type: 'choice',
				instructions:
					'Classify the audience reaction from the emoji list and counts. Weight by count. If there are no reactions, pick none. If several tones are close, pick mixed.',
				options: [
					{ key: 'none', description: 'No reactions on the post.' },
					{ key: 'funny', description: 'Laughing, amused, joking reactions dominate.' },
					{ key: 'love', description: 'Hearts, care, or affection dominate.' },
					{ key: 'supportive', description: 'Claps, likes, fire, 100, or encouragement dominate.' },
					{ key: 'angry', description: 'Anger, dislike, or protest dominate.' },
					{ key: 'sad', description: 'Sadness, sympathy, or crying dominate.' },
					{ key: 'wow', description: 'Surprise, shock, or wow dominate.' },
					{ key: 'mixed', description: 'No single reaction tone clearly wins.' }
				]
			}
		]
	};
}

export function defaultChatConfig(): RunConfig {
	return {
		version: 1,
		model: JEV_MODEL,
		concurrency: 3,
		maxRetries: 2,
		zeroDataRetention: false,
		questions: [
			{
				id: 'topic',
				label: 'Topic',
				enabled: true,
				type: 'choice',
				instructions:
					'Classify the topic of this chat message in a private or group conversation. Use the message text and the short thread context. If the text is empty, infer from media.',
				options: [
					{ key: 'personal', description: 'Life updates, feelings, or everyday talk.' },
					{ key: 'romantic', description: 'Dating, attraction, relationship, or intimacy.' },
					{ key: 'spiritual', description: 'Faith, prayer, scripture, or religious study.' },
					{ key: 'work', description: 'Jobs, school, projects, or professional matters.' },
					{ key: 'logistics', description: 'Scheduling, plans, money, or practical coordination.' },
					{ key: 'banter', description: 'Jokes, memes, teasing, or light chat.' },
					{ key: 'conflict', description: 'Argument, tension, or disagreement.' },
					{ key: 'support', description: 'Comfort, advice, or checking in on wellbeing.' },
					{ key: 'other', description: 'Does not fit the topics above.' }
				]
			},
			{
				id: 'intention',
				label: 'Intention',
				enabled: true,
				type: 'choice',
				instructions:
					'Classify the speaker’s social intention in this message. Pick the primary aim toward the other person or the group.',
				options: [
					{ key: 'romantic', description: 'Seeking closeness, dating, or romantic connection.' },
					{ key: 'friendly', description: 'Warm peer connection without romance.' },
					{ key: 'work', description: 'Getting something done professionally or academically.' },
					{ key: 'family', description: 'Kin, household, or family duty.' },
					{ key: 'logistical', description: 'Arranging time, place, files, or tasks.' },
					{ key: 'requesting', description: 'Asking for help, a favor, or an answer.' },
					{ key: 'apologizing', description: 'Sorry, repair, or making amends.' },
					{ key: 'flirting', description: 'Playful attraction or teasing with romantic charge.' },
					{ key: 'checking_in', description: 'Seeing how the other person is.' },
					{ key: 'other', description: 'Does not fit the intentions above.' }
				]
			},
			{
				id: 'emotion',
				label: 'Emotion',
				enabled: true,
				type: 'choice',
				instructions:
					'Classify the speaker’s felt emotion in this message. Neutral is low-affect or purely practical. Mixed is two strong feelings at once.',
				options: [
					{ key: 'happy', description: 'Joy, excitement, or cheer.' },
					{ key: 'sad', description: 'Hurt, grief, or disappointment.' },
					{ key: 'anxious', description: 'Worry, nervousness, or unease.' },
					{ key: 'angry', description: 'Frustration, irritation, or anger.' },
					{ key: 'affectionate', description: 'Warmth, care, or tenderness.' },
					{ key: 'playful', description: 'Humor, teasing, or lightness.' },
					{ key: 'hopeful', description: 'Looking forward or wanting repair.' },
					{ key: 'embarrassed', description: 'Awkwardness, shame, or self-consciousness.' },
					{ key: 'grateful', description: 'Thanks or appreciation.' },
					{ key: 'neutral', description: 'Little affect; matter-of-fact.' },
					{ key: 'mixed', description: 'Two or more emotions are both strong.' }
				]
			}
		]
	};
}

export function speakerToneQuestions(): QuestionConfig[] {
	return [
		{
			id: 'tone',
			label: 'Tone',
			enabled: true,
			type: 'choice',
			instructions:
				'Classify this person’s general interpersonal tone across the supplied messages, not any single line. Weight repeated patterns over one-off jokes. Mixed if two tones are both strong.',
			options: [
				{ key: 'warm', description: 'Open, kind, or emotionally available.' },
				{ key: 'romantic', description: 'Attraction, dating energy, or couple-like closeness.' },
				{ key: 'playful', description: 'Teasing, humor, or light banter as the default.' },
				{ key: 'professional', description: 'Worklike, efficient, or formally polite.' },
				{ key: 'supportive', description: 'Care, reassurance, or looking after the other person.' },
				{ key: 'distant', description: 'Short, cool, or holding back.' },
				{ key: 'tense', description: 'Irritation, conflict, or guarded friction.' },
				{ key: 'mixed', description: 'Two or more tones are both strong.' }
			]
		},
		{
			id: 'intention',
			label: 'Intention',
			enabled: true,
			type: 'choice',
			instructions:
				'Classify this person’s overall social intention toward the other people in the chat, across the supplied messages.',
			options: [
				{ key: 'romantic', description: 'Seeking closeness, dating, or romantic connection.' },
				{ key: 'friendly', description: 'Warm peer connection without romance.' },
				{ key: 'work', description: 'Getting something done professionally or academically.' },
				{ key: 'family', description: 'Kin, household, or family duty.' },
				{ key: 'logistical', description: 'Arranging time, place, files, or tasks.' },
				{ key: 'supportive', description: 'Comfort, advice, or checking in on wellbeing.' },
				{ key: 'mixed', description: 'Intentions shift and none clearly dominates.' },
				{ key: 'other', description: 'Does not fit the intentions above.' }
			]
		},
		{
			id: 'emotion',
			label: 'Emotion',
			enabled: true,
			type: 'choice',
			instructions:
				'Classify this person’s dominant felt emotion across the supplied messages. Neutral is mostly practical. Mixed is two strong feelings at once.',
			options: [
				{ key: 'happy', description: 'Joy, excitement, or cheer.' },
				{ key: 'sad', description: 'Hurt, grief, or disappointment.' },
				{ key: 'anxious', description: 'Worry, nervousness, or unease.' },
				{ key: 'angry', description: 'Frustration, irritation, or anger.' },
				{ key: 'affectionate', description: 'Warmth, care, or tenderness.' },
				{ key: 'playful', description: 'Humor, teasing, or lightness.' },
				{ key: 'hopeful', description: 'Looking forward or wanting repair.' },
				{ key: 'neutral', description: 'Little affect; matter-of-fact.' },
				{ key: 'mixed', description: 'Two or more emotions are both strong.' }
			]
		}
	];
}

export function cloneConfig(config: RunConfig): RunConfig {
	return structuredClone(config);
}

export function loadConfig(): RunConfig {
	if (typeof localStorage === 'undefined') return defaultConfig();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaultConfig();
		return normalizeConfig(JSON.parse(raw), defaultConfig());
	} catch {
		return defaultConfig();
	}
}

export function saveConfig(config: RunConfig) {
	const next = normalizeConfig(config, defaultConfig());
	localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	return next;
}

export function resetConfig() {
	const next = defaultConfig();
	localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	return next;
}

export function loadChatConfig(): RunConfig {
	if (typeof localStorage === 'undefined') return defaultChatConfig();
	try {
		const raw = localStorage.getItem(CHAT_STORAGE_KEY);
		if (!raw) return defaultChatConfig();
		return normalizeConfig(JSON.parse(raw), defaultChatConfig());
	} catch {
		return defaultChatConfig();
	}
}

export function saveChatConfig(config: RunConfig) {
	const next = normalizeConfig(config, defaultChatConfig());
	localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next));
	return next;
}

export function resetChatConfig() {
	const next = defaultChatConfig();
	localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(next));
	return next;
}

export function enabledQuestions(config: RunConfig) {
	return config.questions.filter((question) => question.enabled);
}

export function toJevQuestions(config: RunConfig) {
	const questions: Record<string, JevQuestion> = {};
	for (const question of enabledQuestions(config)) {
		if (question.type === 'choice') {
			const criteria: Record<string, string> = {};
			for (const option of question.options) {
				const key = slug(option.key);
				if (!key) continue;
				criteria[key] = option.description || key;
			}
			if (Object.keys(criteria).length === 0) continue;
			questions[slug(question.id)] = {
				type: 'choice',
				instructions: question.instructions,
				criteria
			};
		} else if (question.type === 'score') {
			const levels = question.levels.map((level) => level.trim()).filter(Boolean);
			if (levels.length < 2) continue;
			questions[slug(question.id)] = {
				type: 'score',
				instructions: question.instructions,
				criteria: levels
			};
		} else {
			questions[slug(question.id)] = {
				type: 'boolean',
				instructions: question.instructions,
				criteria: {
					true: question.trueDescription || 'true',
					false: question.falseDescription || 'false'
				}
			};
		}
	}
	return questions;
}

export function validateConfig(config: RunConfig): string | null {
	if (!config.model.trim()) return 'Model ID is required.';
	if (config.concurrency < 1 || config.concurrency > 8) return 'Concurrency must be between 1 and 8.';
	if (config.maxRetries < 0 || config.maxRetries > 6) return 'Retries must be between 0 and 6.';
	const enabled = enabledQuestions(config);
	if (enabled.length === 0) return 'Enable at least one question.';
	const ids = new Set<string>();
	for (const question of config.questions) {
		const id = slug(question.id);
		if (!id) return 'Every question needs an id (letters, numbers, underscore).';
		if (ids.has(id)) return `Duplicate question id: ${id}`;
		ids.add(id);
		if (!question.label.trim()) return `Question ${id} needs a label.`;
		if (!question.instructions.trim()) return `Question ${id} needs instructions.`;
		if (question.type === 'choice') {
			const keys = question.options.map((option) => slug(option.key)).filter(Boolean);
			if (keys.length === 0) return `Choice question ${id} needs at least one option.`;
			if (new Set(keys).size !== keys.length) return `Choice question ${id} has duplicate option keys.`;
		}
		if (question.type === 'score' && question.levels.filter((level) => level.trim()).length < 2) {
			return `Score question ${id} needs at least two levels.`;
		}
	}
	if (Object.keys(toJevQuestions(config)).length === 0) {
		return 'No valid enabled questions to send to Jev.';
	}
	return null;
}

export function slug(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 40);
}

export function newQuestion(type: QuestionConfig['type']): QuestionConfig {
	const id = `${type}_${Math.random().toString(36).slice(2, 6)}`;
	if (type === 'choice') {
		return {
			id,
			label: 'New choice',
			enabled: true,
			type: 'choice',
			instructions: 'Pick the best matching option for this post.',
			options: [
				{ key: 'yes', description: 'Matches this option.' },
				{ key: 'no', description: 'Does not match.' }
			]
		};
	}
	if (type === 'score') {
		return {
			id,
			label: 'New score',
			enabled: true,
			type: 'score',
			instructions: 'Grade this post on the rubric.',
			levels: ['Low', 'Medium', 'High']
		};
	}
	return {
		id,
		label: 'New boolean',
		enabled: true,
		type: 'boolean',
		instructions: 'Is this statement true of the post?',
		trueDescription: 'Yes',
		falseDescription: 'No'
	};
}

function normalizeConfig(value: unknown, fallback: RunConfig): RunConfig {
	if (!value || typeof value !== 'object') return fallback;
	const record = value as Partial<RunConfig>;
	const questions = Array.isArray(record.questions)
		? record.questions.map(normalizeQuestion).filter((question): question is QuestionConfig => question != null)
		: fallback.questions;
	return {
		version: 1,
		model: typeof record.model === 'string' && record.model.trim() ? record.model.trim() : fallback.model,
		concurrency: clamp(Number(record.concurrency) || fallback.concurrency, 1, 8),
		maxRetries: clamp(Number(record.maxRetries) || 0, 0, 6),
		zeroDataRetention: Boolean(record.zeroDataRetention),
		questions: questions.length ? questions : fallback.questions
	};
}

function normalizeQuestion(value: unknown): QuestionConfig | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Partial<QuestionConfig> & { options?: unknown; levels?: unknown };
	const id = typeof record.id === 'string' ? slug(record.id) : '';
	const label = typeof record.label === 'string' ? record.label : id;
	const instructions = typeof record.instructions === 'string' ? record.instructions : '';
	const enabled = record.enabled !== false;
	if (!id) return null;
	if (record.type === 'score') {
		const levels = Array.isArray(record.levels)
			? record.levels.map((level) => String(level ?? '')).filter((level) => level.trim())
			: ['Low', 'Medium', 'High'];
		return { id, label, enabled, type: 'score', instructions, levels };
	}
	if (record.type === 'boolean') {
		return {
			id,
			label,
			enabled,
			type: 'boolean',
			instructions,
			trueDescription: typeof record.trueDescription === 'string' ? record.trueDescription : 'Yes',
			falseDescription: typeof record.falseDescription === 'string' ? record.falseDescription : 'No'
		};
	}
	const options = Array.isArray(record.options)
		? record.options
				.map((option) => {
					if (!option || typeof option !== 'object') return null;
					const item = option as ChoiceOption;
					const key = slug(String(item.key ?? ''));
					if (!key) return null;
					return { key, description: String(item.description ?? '') };
				})
				.filter((option): option is ChoiceOption => option != null)
		: [];
	return {
		id,
		label,
		enabled,
		type: 'choice',
		instructions,
		options
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
