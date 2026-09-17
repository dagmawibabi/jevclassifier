import { experimental_evaluate as evaluate } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createTypeSafeAi } from '@ai-sdk/typesafe-ai';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { costFromUsage, isJevProvider, modelForProvider, type JevProvider } from '$lib/cost';
import { scoreLabel, type Answer } from '$lib/types';
import type { JevQuestion } from '$lib/config';
import type { RequestHandler } from './$types';

type Body = {
	id?: number;
	text?: string;
	date?: string;
	from?: string;
	fromId?: string | null;
	media?: string | null;
	forwardedFrom?: string | null;
	replyToId?: number | null;
	chatType?: string | null;
	threadContext?: string;
	reactions?: { emoji: string; count: number }[];
	model?: string;
	provider?: JevProvider;
	kind?: 'message' | 'speaker';
	others?: string[];
	speakerMessages?: { date: string; text: string }[];
	maxRetries?: number;
	zeroDataRetention?: boolean;
	questions?: Record<string, JevQuestion>;
};

function asQuestions(value: Body['questions']) {
	if (!value || typeof value !== 'object') return null;
	const questions: Record<string, JevQuestion> = {};
	for (const [id, question] of Object.entries(value)) {
		if (!/^[a-z0-9_]{1,40}$/.test(id) || !question) continue;
		if (question.type === 'choice' && question.criteria && Object.keys(question.criteria).length > 0) {
			questions[id] = {
				type: 'choice',
				instructions: String(question.instructions ?? ''),
				criteria: Object.fromEntries(
					Object.entries(question.criteria)
						.slice(0, 24)
						.map(([key, description]) => [key, String(description ?? key)])
				)
			};
		} else if (question.type === 'score' && Array.isArray(question.criteria) && question.criteria.length >= 2) {
			questions[id] = {
				type: 'score',
				instructions: String(question.instructions ?? ''),
				criteria: question.criteria.slice(0, 8).map((level) => String(level ?? ''))
			};
		} else if (question.type === 'boolean') {
			questions[id] = {
				type: 'boolean',
				instructions: String(question.instructions ?? ''),
				criteria: {
					true: String(question.criteria?.true ?? 'true'),
					false: String(question.criteria?.false ?? 'false')
				}
			};
		}
	}
	return Object.keys(questions).length ? questions : null;
}

function typesafeEnvKey() {
	return (
		env.JEV_API_KEY?.trim() ||
		env.TYPESAFE_API_KEY?.trim() ||
		env.TYPESAFE_AI_API_KEY?.trim() ||
		''
	);
}

function requestedProvider(request: Request, body: Body): JevProvider {
	const header = request.headers.get('x-jev-provider');
	if (isJevProvider(header)) return header;
	if (isJevProvider(body.provider)) return body.provider;
	return typesafeEnvKey() ? 'typesafe' : 'gateway';
}

function bearerKey(request: Request) {
	const authorization = request.headers.get('authorization');
	if (authorization?.toLowerCase().startsWith('bearer ')) {
		return authorization.slice(7).trim();
	}
	return request.headers.get('x-ai-gateway-api-key')?.trim() || request.headers.get('x-jev-api-key')?.trim() || '';
}

function resolveCredentials(request: Request, body: Body) {
	const provider = requestedProvider(request, body);
	if (provider === 'typesafe') {
		const apiKey = typesafeEnvKey() || bearerKey(request);
		return { provider, apiKey };
	}
	const apiKey = env.AI_GATEWAY_API_KEY?.trim() || bearerKey(request);
	return { provider, apiKey };
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as Body;
	const { provider, apiKey } = resolveCredentials(request, body);
	if (!apiKey) {
		return json(
			{
				error:
					provider === 'typesafe'
						? 'No TypeSafe key. Add JEV_API_KEY to .env or save one under Key.'
						: 'No AI Gateway key. Add AI_GATEWAY_API_KEY to .env or save one under Key.'
			},
			{ status: 401 }
		);
	}

	const evaluationModel =
		provider === 'typesafe'
			? createTypeSafeAi({ apiKey }).evaluationModel(modelForProvider(provider, body.model))
			: createGateway({ apiKey }).evaluationModel(modelForProvider(provider, body.model));
	if (body.id == null) {
		return json({ error: 'Each request needs a post id.' }, { status: 400 });
	}

	const questions = asQuestions(body.questions);
	if (!questions) {
		return json({ error: 'No valid Jev questions in this request.' }, { status: 400 });
	}

	try {
		const result = await evaluate({
			model: evaluationModel,
			maxRetries: Math.min(6, Math.max(0, body.maxRetries ?? 2)),
			providerOptions:
				provider === 'gateway' && body.zeroDataRetention ? { gateway: { zeroDataRetention: true } } : undefined,
			state:
				body.kind === 'speaker'
					? {
							speaker: {
								name: body.from ?? '',
								chat_type: body.chatType ?? null,
								others: body.others ?? [],
								message_count: body.speakerMessages?.length ?? 0,
								messages: (body.speakerMessages ?? []).slice(0, 80).map((item) => ({
									date: item.date ?? '',
									text: (item.text ?? '').slice(0, 600)
								}))
							}
						}
					: {
							message: {
								id: body.id,
								date: body.date ?? '',
								from: body.from ?? '',
								from_id: body.fromId ?? null,
								chat_type: body.chatType ?? null,
								media: body.media ?? null,
								forwarded_from: body.forwardedFrom ?? null,
								reply_to_message_id: body.replyToId ?? null,
								text: (body.text ?? '').slice(0, 8000),
								thread_context: (body.threadContext ?? '').slice(0, 2000),
								reactions: body.reactions ?? [],
								reaction_summary:
									body.reactions && body.reactions.length
										? body.reactions.map((reaction) => `${reaction.emoji} x${reaction.count}`).join(', ')
										: 'none'
							}
						},
			questions
		});

		const answers: Record<string, Answer> = {};
		for (const [id, question] of Object.entries(questions)) {
			const raw = result.answers[id];
			if (!raw) continue;
			if (raw.type === 'choice' && question.type === 'choice') {
				answers[id] = { type: 'choice', choice: raw.choice, probabilities: raw.probabilities };
			} else if (raw.type === 'score' && question.type === 'score') {
				answers[id] = {
					type: 'score',
					score: raw.score,
					label: scoreLabel(raw.score, question.criteria),
					probabilities: raw.probabilities
				};
			} else if (raw.type === 'boolean') {
				answers[id] = { type: 'boolean', probability: raw.probability };
			}
		}

		return json({
			id: body.id,
			classification: {
				answers,
				usage: result.usage,
				costUsd: costFromUsage(result.usage)
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Jev could not classify this post.';
		return json({ error: message }, { status: 502 });
	}
};
