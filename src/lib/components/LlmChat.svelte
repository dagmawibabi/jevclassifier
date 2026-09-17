<script lang="ts">
	import { onMount } from 'svelte';
	import Meters from '$lib/components/Meters.svelte';
	import { JEV_MODEL, formatTokens, formatUsd } from '$lib/cost';
	import { classifyAuthHeaders, keyUi } from '$lib/key.svelte';
	import { appendToken, type ChatTurn } from '$lib/llm-text';

	type LlmResponse = {
		kind?: 'token' | 'eos';
		word?: string;
		top?: { key: string; value: number }[];
		hops?: number;
		usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
		costUsd?: number;
		error?: string;
	};

	const MAX_WORDS = 72;

	let turns = $state<ChatTurn[]>([]);
	let input = $state('');
	let running = $state(false);
	let error = $state('');
	let top = $state<{ key: string; value: number }[]>([]);
	let lastWord = $state('');
	let hops = $state(0);
	let tokens = $state(0);
	let cost = $state(0);
	let words = $state(0);
	let composer = $state<HTMLTextAreaElement | null>(null);
	let threadEl = $state<HTMLElement | null>(null);
	let abort = $state<AbortController | null>(null);

	onMount(() => composer?.focus());

	function scrollThread() {
		queueMicrotask(() => {
			threadEl?.scrollTo({ top: threadEl.scrollHeight, behavior: 'smooth' });
		});
	}

	function keyReady() {
		return keyUi.provider === 'typesafe'
			? keyUi.hasTypesafeEnv || keyUi.hasTypesafeLocal
			: keyUi.hasGatewayEnv || keyUi.hasGatewayLocal;
	}

	async function send() {
		const text = input.trim();
		if (!text || running) return;
		if (!keyReady()) {
			keyUi.open = true;
			return;
		}
		input = '';
		error = '';
		turns = [...turns, { role: 'user', text }, { role: 'assistant', text: '' }];
		scrollThread();
		await generate();
	}

	async function generate() {
		abort?.abort();
		abort = new AbortController();
		running = true;
		words = 0;
		const signal = abort.signal;
		try {
			while (words < MAX_WORDS && abort && !signal.aborted) {
				const live = turns.at(-1);
				const conversation = live?.role === 'assistant' ? turns.slice(0, -1) : turns;
				const draft = live?.role === 'assistant' ? live.text : '';
				const response = await fetch('/api/llm', {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...classifyAuthHeaders() },
					signal,
					body: JSON.stringify({
						conversation,
						draft,
						model: JEV_MODEL,
						provider: keyUi.provider
					})
				});
				const payload = (await response.json()) as LlmResponse;
				if (response.status === 401) keyUi.open = true;
				if (!response.ok) throw new Error(payload.error || `LLM failed (${response.status})`);
				top = payload.top ?? [];
				hops = payload.hops ?? hops;
				tokens += payload.usage?.totalTokens ?? 0;
				cost += payload.costUsd ?? 0;
				if (payload.kind === 'eos') {
					lastWord = 'STOP';
					break;
				}
				const word = payload.word ?? '';
				lastWord = word;
				turns = turns.map((turn, index) =>
					index === turns.length - 1 && turn.role === 'assistant'
						? { ...turn, text: appendToken(turn.text, word) }
						: turn
				);
				words += 1;
				scrollThread();
			}
		} catch (caught) {
			if (signal.aborted) return;
			error = caught instanceof Error ? caught.message : 'Jev could not continue.';
		} finally {
			running = false;
			if (turns.at(-1)?.role === 'assistant' && !turns.at(-1)?.text.trim() && error) {
				turns = turns.slice(0, -1);
			}
			composer?.focus();
		}
	}

	function stop() {
		abort?.abort();
		running = false;
	}

	function clearChat() {
		stop();
		turns = [];
		top = [];
		lastWord = '';
		hops = 0;
		tokens = 0;
		cost = 0;
		words = 0;
		error = '';
		composer?.focus();
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void send();
		}
	}
</script>

<main
	class="mx-auto grid h-full min-h-0 max-w-[1280px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]"
>
	<section class="flex min-h-0 flex-col border-rule lg:border-r">
		<div class="flex shrink-0 items-end justify-between gap-4 px-6 py-4">
			<div>
				<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">LLM</p>
				<h1 class="mt-1 text-[22px] font-medium tracking-tight">Dictionary chat</h1>
				<p class="mt-1 font-mono text-[11px] text-mute">
					Jev picks each next word from 10,017 defined entries. STOP ends the reply.
				</p>
			</div>
			<div class="text-right font-mono text-[11px] text-mute">
				<div>{formatTokens(tokens)} tok · {formatUsd(cost)}</div>
				<div>{words} words</div>
			</div>
		</div>
		<div class="px-6">
			<div class="h-px bg-rule"></div>
		</div>

		<div bind:this={threadEl} class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
			{#if !turns.length}
				<div class="w-full rounded-[4px] border border-dashed border-rule bg-wash px-5 py-8">
					<p class="text-[15px] leading-relaxed">
						Ask anything. Jev classifies the next dictionary word from structured chat state (user
						message, draft, last token, repeats). Common words are always in the choice set. STOP is
						the stop character and finishes the reply.
					</p>
				</div>
			{/if}
			<div class="flex flex-col gap-4">
				{#each turns as turn, index (index)}
					<div class="flex {turn.role === 'user' ? 'justify-end' : 'justify-start'}">
						<div
							class="max-w-[min(100%,42rem)] rounded-[4px] px-4 py-3 text-[15px] leading-relaxed {turn.role ===
							'user'
								? 'bg-ink text-paper'
								: 'bg-soft text-ink'}"
						>
							<p
								class="mb-1 font-mono text-[10px] tracking-[0.16em] uppercase {turn.role === 'user'
									? 'text-paper/60'
									: 'text-mute'}"
							>
								{turn.role === 'user' ? 'You' : 'Jev'}
							</p>
							<p class="whitespace-pre-wrap">
								{turn.text}{#if running && index === turns.length - 1 && turn.role === 'assistant'}<span
										class="ml-0.5 inline-block h-[1em] w-[7px] translate-y-[2px] bg-ink"
										aria-hidden="true"
									></span>{/if}
							</p>
						</div>
					</div>
				{/each}
			</div>
			{#if error}
				<p class="mt-4 font-mono text-[12px] text-ink">{error}</p>
			{/if}
		</div>

		<form
			class="shrink-0 border-t border-rule px-6 py-4"
			onsubmit={(event) => {
				event.preventDefault();
				void send();
			}}
		>
			<label class="sr-only" for="llm-input">Message</label>
			<div class="flex items-end gap-3">
				<textarea
					id="llm-input"
					bind:this={composer}
					bind:value={input}
					onkeydown={onKey}
					rows="2"
					placeholder="Message Jev"
					class="min-h-[52px] flex-1 resize-none rounded-[4px] border border-rule bg-paper px-3 py-2 text-[15px] outline-none focus:border-ink"
				></textarea>
				{#if running}
					<button
						type="button"
						class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]"
						onclick={stop}
					>
						Stop
					</button>
				{:else}
					<button
						type="submit"
						class="h-9 rounded-full bg-ink px-4 font-mono text-[11px] text-paper">Send</button
					>
				{/if}
				<button
					type="button"
					class="h-9 rounded-full border border-rule px-4 font-mono text-[11px] disabled:opacity-40"
					onclick={clearChat}
					disabled={!turns.length && !top.length}
				>
					Clear
				</button>
			</div>
		</form>
	</section>

	<aside class="flex min-h-0 flex-col overflow-hidden">
		<div class="px-6 py-4">
			<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">This step</p>
			<h2 class="mt-1 text-[18px] font-medium tracking-tight">Top 15 words</h2>
			<p class="mt-1 font-mono text-[11px] text-mute">
				{#if lastWord}
					chose {lastWord} · {hops} hop{hops === 1 ? '' : 's'}
				{:else}
					probabilities after the latest dictionary choice
				{/if}
			</p>
		</div>
		<div class="px-6">
			<div class="h-px bg-rule"></div>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
			{#if top.length}
				<Meters rows={top} />
			{:else}
				<p class="font-mono text-[12px] text-mute">
					Send a message to see Jev’s word distribution.
				</p>
			{/if}
		</div>
	</aside>
</main>
