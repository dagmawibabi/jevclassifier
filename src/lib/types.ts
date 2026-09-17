import type { ChannelPost } from './telegram';
import { slug, type QuestionConfig } from './config';

export type PostStatus = 'queued' | 'reading' | 'done' | 'error';

export type ChoiceAnswer = {
	type: 'choice';
	choice: string;
	probabilities?: Record<string, number>;
};

export type ScoreAnswer = {
	type: 'score';
	score: number;
	label: string;
	probabilities?: Record<string, number>;
};

export type BooleanAnswer = {
	type: 'boolean';
	probability: number;
};

export type Answer = ChoiceAnswer | ScoreAnswer | BooleanAnswer;

export type Classification = {
	answers: Record<string, Answer>;
	usage: {
		inputTokens?: number;
		outputTokens?: number;
		totalTokens?: number;
	};
	costUsd: number;
};

export type ClassifiedPost = ChannelPost & {
	status: PostStatus;
	classification?: Classification;
	error?: string;
};

export type ClassifyResponse = {
	id: number;
	classification: Classification;
};

export function choiceBars(answer: ChoiceAnswer | undefined, options: { key: string }[]) {
	return options.map((option) => ({
		key: option.key,
		value: answer?.probabilities?.[option.key] ?? (answer?.choice === option.key ? 1 : 0)
	}));
}

export function scoreBars(answer: ScoreAnswer | undefined, levels: string[]) {
	return levels.map((level, index) => ({
		key: shortLevel(level),
		value: answer?.probabilities?.[String(index)] ?? (answer && Math.round(answer.score) === index ? 1 : 0)
	}));
}

export function scoreLabel(score: number, levels: string[]) {
	if (levels.length === 0) return String(score);
	const index = Math.min(levels.length - 1, Math.max(0, Math.round(score)));
	return shortLevel(levels[index] ?? String(score));
}

export function shortLevel(level: string) {
	const before = level.split(':')[0]?.trim() ?? level;
	return before.toLowerCase();
}

export function chipAnswers(answers: Record<string, Answer> | undefined, questions: QuestionConfig[]) {
	if (!answers) return [];
	const chips: string[] = [];
	for (const question of questions) {
		if (!question.enabled) continue;
		const answer = answers[slug(question.id)] ?? answers[question.id];
		if (!answer) continue;
		if (answer.type === 'choice') chips.push(answer.choice);
		if (answer.type === 'score') chips.push(answer.label);
		if (answer.type === 'boolean') chips.push(`${question.id} ${answer.probability >= 0.5 ? 'yes' : 'no'}`);
	}
	return chips;
}
