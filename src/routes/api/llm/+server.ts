import { experimental_evaluate as evaluate } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createTypeSafeAi } from '@ai-sdk/typesafe-ai';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { costFromUsage, isJevProvider, modelForProvider, type JevProvider } from '$lib/cost';
import {
	buildChoice,
	COMPLETE_INSTRUCTIONS,
	completeThreshold,
	DICTIONARY,
	NEXT_WORD_INSTRUCTIONS,
	STOP_LABEL,
	topChoices,
	type DictEntry
} from '$lib/llm-dictionary';
import { analyzeDraft, formatConversation, lastUserMessage, type ChatTurn } from '$lib/llm-text';
import type { RequestHandler } from './$types';

type Body = {
	conversation?: ChatTurn[];
	draft?: string;
	model?: string;
	provider?: JevProvider;
	maxRetries?: number;
	zeroDataRetention?: boolean;
};

const MAX_HOPS = 8;

function typesafeEnvKey() {
	return (
		env.JEV_API_KEY?.trim() || env.TYPESAFE_API_KEY?.trim() || env.TYPESAFE_AI_API_KEY?.trim() || ''
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
	if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
	return (
		request.headers.get('x-ai-gateway-api-key')?.trim() ||
		request.headers.get('x-jev-api-key')?.trim() ||
		''
	);
}

function resolveCredentials(request: Request, body: Body) {
	const provider = requestedProvider(request, body);
	if (provider === 'typesafe') return { provider, apiKey: typesafeEnvKey() || bearerKey(request) };
	return { provider, apiKey: env.AI_GATEWAY_API_KEY?.trim() || bearerKey(request) };
}

function asConversation(value: Body['conversation']): ChatTurn[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(turn) =>
				turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.text === 'string'
		)
		.map((turn) => ({ role: turn.role, text: turn.text.slice(0, 4000) }))
		.slice(-24);
}

function chatState(conversation: ChatTurn[], draft: string) {
	const analysis = analyzeDraft(draft);
	return {
		transcript: formatConversation(conversation, draft),
		task: 'Continue the assistant reply by choosing one next English token, or STOP.',
		stop_character: STOP_LABEL,
		user_message: lastUserMessage(conversation),
		conversation: conversation.map((turn) => ({ role: turn.role, text: turn.text })),
		draft: draft || null,
		draft_tokens: analysis.tokens,
		last_token: analysis.last || null,
		word_count: analysis.wordCount,
		repeated_last_token: analysis.consecutiveRepeat,
		sentence_already_complete: analysis.sentenceComplete,
		do_not_repeat: analysis.banned
	};
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

	const conversation = asConversation(body.conversation);
	const draft = typeof body.draft === 'string' ? body.draft.slice(0, 8000) : '';
	if (!conversation.some((turn) => turn.role === 'user')) {
		return json({ error: 'Send a user message first.' }, { status: 400 });
	}

	const analysis = analyzeDraft(draft);
	if (analysis.consecutiveRepeat || analysis.repeatCount >= 3 || analysis.wordCount >= 36) {
		return json({
			kind: 'eos',
			word: STOP_LABEL,
			top: [{ key: STOP_LABEL, value: 1 }],
			hops: 0,
			usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
			costUsd: 0
		});
	}

	const evaluationModel =
		provider === 'typesafe'
			? createTypeSafeAi({ apiKey }).evaluationModel(modelForProvider(provider, body.model))
			: createGateway({ apiKey }).evaluationModel(modelForProvider(provider, body.model));

	let pool: DictEntry[] = DICTIONARY;
	let hops = 0;
	let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
	let lastTop: { key: string; value: number }[] = [];
	const state = chatState(conversation, draft);

	try {
		while (hops < MAX_HOPS) {
			hops += 1;
			const { criteria, meta, remaining } = buildChoice(pool, analysis.banned);
			const result = await evaluate({
				model: evaluationModel,
				maxRetries: Math.min(6, Math.max(0, body.maxRetries ?? 2)),
				abortSignal: request.signal,
				providerOptions:
					provider === 'gateway' && body.zeroDataRetention
						? { gateway: { zeroDataRetention: true } }
						: undefined,
				state,
				questions: {
					complete: {
						type: 'boolean',
						instructions: COMPLETE_INSTRUCTIONS,
						criteria: {
							true: 'The draft is already a finished assistant reply. Emit STOP.',
							false: 'The assistant still needs another word.'
						}
					},
					next: {
						type: 'choice',
						instructions: NEXT_WORD_INSTRUCTIONS,
						criteria
					}
				}
			});

			usage = {
				inputTokens: usage.inputTokens + (result.usage?.inputTokens ?? 0),
				outputTokens: usage.outputTokens + (result.usage?.outputTokens ?? 0),
				totalTokens: usage.totalTokens + (result.usage?.totalTokens ?? 0)
			};

			const complete = result.answers.complete;
			const answer = result.answers.next;
			if (!answer || answer.type !== 'choice') {
				return json({ error: 'Jev did not return a next-word choice.' }, { status: 502 });
			}

			lastTop = topChoices(answer.probabilities, meta);
			const doneP = complete?.type === 'boolean' ? complete.probability : 0;
			const threshold = completeThreshold({
				empty: !draft.trim(),
				sentenceComplete: analysis.sentenceComplete,
				consecutiveRepeat: analysis.consecutiveRepeat,
				wordCount: analysis.wordCount
			});
			if (doneP >= threshold) {
				const withoutStop = lastTop.filter((row) => row.key !== STOP_LABEL);
				return json({
					kind: 'eos',
					word: STOP_LABEL,
					top: [{ key: STOP_LABEL, value: doneP }, ...withoutStop].slice(0, 15),
					hops,
					usage,
					costUsd: costFromUsage(usage)
				});
			}

			const picked = meta[answer.choice];
			if (!picked) {
				return json({ error: 'Jev picked an unknown dictionary option.' }, { status: 502 });
			}

			if (picked.kind === 'bucket' && picked.start != null && picked.end != null) {
				pool = remaining.slice(picked.start, picked.end);
				continue;
			}
			if (picked.kind === 'eos') {
				return json({
					kind: 'eos',
					word: STOP_LABEL,
					top: lastTop,
					hops,
					usage,
					costUsd: costFromUsage(usage)
				});
			}
			return json({
				kind: 'token',
				word: picked.word ?? '',
				top: lastTop,
				hops,
				usage,
				costUsd: costFromUsage(usage)
			});
		}

		return json({ error: 'Could not narrow the dictionary to a word.' }, { status: 502 });
	} catch (error) {
		if (request.signal.aborted) return json({ error: 'Stopped.' }, { status: 400 });
		const message = error instanceof Error ? error.message : 'Jev could not pick the next word.';
		return json({ error: message }, { status: 502 });
	}
};
