<script lang="ts">
	import { onMount } from 'svelte';
	import Meters from '$lib/components/Meters.svelte';
	import {
		defaultChatConfig,
		defaultConfig,
		enabledQuestions,
		loadChatConfig,
		loadConfig,
		saveChatConfig,
		saveConfig,
		slug,
		speakerToneQuestions,
		toJevQuestions,
		type QuestionConfig,
		type RunConfig
	} from '$lib/config';
	import { formatTokens, formatUsd } from '$lib/cost';
	import { classifyAuthHeaders, keyUi } from '$lib/key.svelte';
	import {
		dateBounds,
		filterPosts,
		parseChannelExport,
		reactionSummary,
		speakersOf,
		threadContext,
		type ChannelPost
	} from '$lib/telegram';
	import {
		chipAnswers,
		choiceBars,
		scoreBars,
		type Classification,
		type ClassifiedPost,
		type ClassifyResponse,
		type PostStatus
	} from '$lib/types';

	type SpeakerRead = {
		name: string;
		status: PostStatus;
		classification?: Classification;
		error?: string;
	};

	let { mode }: { mode: 'channel' | 'chat' } = $props();

	function booleanAnswer(probability: number | undefined) {
		if (probability == null) {
			return [
				{ key: 'true', value: 0 },
				{ key: 'false', value: 0 }
			];
		}
		return [
			{ key: 'true', value: probability },
			{ key: 'false', value: 1 - probability }
		];
	}

	const isChat = $derived(mode === 'chat');

	function readConfig(): RunConfig {
		return isChat ? loadChatConfig() : loadConfig();
	}

	function writeConfig(next: RunConfig) {
		return isChat ? saveChatConfig(next) : saveConfig(next);
	}

	let config = $state<RunConfig>(mode === 'chat' ? defaultChatConfig() : defaultConfig());
	let archive = $state<ChannelPost[]>([]);
	let chatType = $state<string | null>(null);
	let posts = $state<ClassifiedPost[]>([]);
	let channelName = $state('');
	let fileName = $state('');
	let running = $state(false);
	let paused = $state(false);
	let fileError = $state('');
	let dragOver = $state(false);
	let activeId = $state<number | null>(null);
	let selectedId = $state<number | null>(null);
	let startedAt = $state<number | null>(null);
	let now = $state(Date.now());
	let feedEl = $state<HTMLElement | null>(null);
	let abort = $state<AbortController | null>(null);
	let dateFrom = $state('');
	let dateTo = $state('');
	let limit = $state(50);
	let order = $state<'newest' | 'oldest'>('newest');
	let requireText = $state(true);
	let requireReactions = $state(false);
	let skipForwards = $state(false);
	let speakers = $state<string[]>([]);
	let configOpen = $state(true);
	let peopleReads = $state<SpeakerRead[]>([]);
	let selectedSpeaker = $state<string | null>(null);
	const toneQuestions = speakerToneQuestions();

	const questions = $derived(config.questions);
	const activeQuestions = $derived(enabledQuestions(config));
	const bounds = $derived(dateBounds(archive));
	const people = $derived(speakersOf(archive));
	const matching = $derived(
		filterPosts(archive, {
			dateFrom,
			dateTo,
			requireText,
			requireReactions,
			skipForwards,
			speakers,
			newestFirst: order === 'newest',
			limit
		})
	);
	const finished = $derived(
		posts.filter((p) => p.status === 'done' || p.status === 'error').length
	);
	const doneCount = $derived(posts.filter((p) => p.status === 'done').length);
	const errorCount = $derived(posts.filter((p) => p.status === 'error').length);
	const viewing = $derived(
		posts.find((p) => p.id === (selectedId ?? activeId)) ??
			posts.find((p) => p.status === 'reading') ??
			null
	);
	const viewingPerson = $derived(
		peopleReads.find((person) => person.name === selectedSpeaker) ?? null
	);
	const asideQuestions = $derived(selectedSpeaker ? toneQuestions : questions);
	const workTotal = $derived(posts.length + (isChat ? peopleReads.length : 0));
	const workDone = $derived(
		finished +
			peopleReads.filter((person) => person.status === 'done' || person.status === 'error').length
	);
	const progress = $derived(workTotal ? workDone / workTotal : 0);
	const busy = $derived(running || paused);
	const totals = $derived.by(() => {
		let input = 0;
		let output = 0;
		let cost = 0;
		for (const post of posts) {
			input += post.classification?.usage.inputTokens ?? 0;
			output += post.classification?.usage.outputTokens ?? 0;
			cost += post.classification?.costUsd ?? 0;
		}
		for (const person of peopleReads) {
			input += person.classification?.usage.inputTokens ?? 0;
			output += person.classification?.usage.outputTokens ?? 0;
			cost += person.classification?.costUsd ?? 0;
		}
		return { input, output, total: input + output, cost };
	});
	const mix = $derived.by(() => {
		const firstChoice = activeQuestions.find((question) => question.type === 'choice');
		if (!firstChoice || firstChoice.type !== 'choice') return [];
		const counts = new Map<string, number>();
		for (const post of posts) {
			const answer =
				post.classification?.answers[slug(firstChoice.id)] ??
				post.classification?.answers[firstChoice.id];
			if (answer?.type === 'choice')
				counts.set(answer.choice, (counts.get(answer.choice) ?? 0) + 1);
		}
		return [...counts.entries()].map(([key, count]) => ({ key, count }));
	});

	onMount(() => {
		config = readConfig();
	});

	$effect(() => {
		if (!running) return;
		const id = setInterval(() => {
			now = Date.now();
		}, 400);
		return () => clearInterval(id);
	});

	function rate() {
		if (!startedAt || finished === 0) return '—';
		const elapsed = Math.max((now - startedAt) / 1000, 0.1);
		return `${(finished / elapsed).toFixed(2)} /s`;
	}

	function formatDate(value: string) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	}

	function metersFor(question: QuestionConfig, classification: Classification | undefined) {
		const answer =
			classification?.answers[slug(question.id)] ?? classification?.answers[question.id];
		if (question.type === 'choice') {
			return choiceBars(answer?.type === 'choice' ? answer : undefined, question.options);
		}
		if (question.type === 'score') {
			return scoreBars(answer?.type === 'score' ? answer : undefined, question.levels);
		}
		return booleanAnswer(answer?.type === 'boolean' ? answer.probability : undefined);
	}

	function speakerRequestId(name: string) {
		let hash = 0;
		for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
		return 2_100_000_000 + (hash % 50_000_000);
	}

	function seedPeople() {
		const names = [...new Set(posts.map((post) => post.from).filter(Boolean))].sort();
		peopleReads = names.map((name) => ({ name, status: 'queued' as const }));
		selectedSpeaker = names[0] ?? null;
		selectedId = null;
	}

	function toggleQuestion(id: string) {
		const next = config.questions.map((question) =>
			question.id === id ? { ...question, enabled: !question.enabled } : question
		);
		if (!next.some((question) => question.enabled)) return;
		config = writeConfig({ ...config, questions: next });
	}

	function toggleSpeaker(name: string) {
		if (speakers.includes(name)) {
			speakers = speakers.filter((item) => item !== name);
		} else {
			speakers = [...speakers, name];
		}
	}

	async function loadExport(data: unknown, name: string) {
		fileError = '';
		fileName = name;
		abort?.abort();
		running = false;
		paused = false;
		const parsed = parseChannelExport(data);
		channelName = parsed.name;
		chatType = parsed.type;
		archive = parsed.posts;
		const range = dateBounds(parsed.posts);
		dateFrom = range.min;
		dateTo = range.max;
		limit = Math.min(isChat ? 80 : 50, parsed.posts.length);
		speakers = [];
		requireReactions = false;
		skipForwards = isChat;
		posts = [];
		peopleReads = [];
		selectedSpeaker = null;
		configOpen = true;
		selectedId = null;
		activeId = null;
		startedAt = null;
	}

	async function onFile(file: File | undefined) {
		if (!file) return;
		try {
			await loadExport(JSON.parse(await file.text()), file.name);
		} catch (error) {
			fileError = error instanceof Error ? error.message : 'Could not read that JSON file.';
			archive = [];
			posts = [];
		}
	}

	async function loadSample() {
		try {
			const path = isChat ? '/sample-chat.json' : '/sample.json';
			const response = await fetch(path);
			await loadExport(await response.json(), isChat ? 'sample-chat.json' : 'sample.json');
		} catch (error) {
			fileError = error instanceof Error ? error.message : 'Could not load the sample export.';
		}
	}

	function applySelection() {
		posts = matching.map((post) => ({ ...post, status: 'queued' as const }));
		selectedId = posts[0]?.id ?? null;
		activeId = null;
		startedAt = null;
	}

	async function startRun() {
		paused = false;
		configOpen = false;
		applySelection();
		if (isChat) seedPeople();
		await classifyAll(true);
		if (paused) return;
		if (isChat) await analyzeSpeakers();
	}

	async function resumeRun() {
		paused = false;
		configOpen = false;
		await classifyAll();
		if (paused) return;
		if (isChat) await analyzeSpeakers();
	}

	async function classifyAll(force = false) {
		config = readConfig();
		abort?.abort();
		abort = new AbortController();
		if (force) {
			posts = posts.map((post) => ({
				...post,
				status: 'queued',
				classification: undefined,
				error: undefined
			}));
		}
		paused = false;
		running = true;
		startedAt = startedAt && finished > 0 && !force ? startedAt : Date.now();
		let cursor = 0;
		const concurrency = config.concurrency;

		const workers = Array.from({ length: concurrency }, async () => {
			while (cursor < posts.length && abort && !abort.signal.aborted) {
				const index = cursor++;
				if (posts[index]?.status === 'done') continue;
				await classifyOne(index, abort.signal);
			}
		});

		await Promise.all(workers);
		running = false;
	}

	async function analyzeSpeakers() {
		if (paused || !abort || abort.signal.aborted) return;
		if (!peopleReads.length) seedPeople();
		const names = peopleReads.map((person) => person.name);
		if (!names.length) return;
		running = true;
		config = readConfig();
		let cursor = 0;
		const workers = Array.from({ length: Math.min(config.concurrency, names.length) }, async () => {
			while (cursor < names.length && abort && !abort.signal.aborted) {
				const index = cursor++;
				const name = names[index];
				if (!name) continue;
				if (peopleReads[index]?.status === 'done') continue;
				await classifySpeaker(
					name,
					names.filter((other) => other !== name),
					abort.signal
				);
			}
		});
		await Promise.all(workers);
		running = false;
	}

	async function classifySpeaker(name: string, others: string[], signal: AbortSignal) {
		peopleReads = peopleReads.map((person) =>
			person.name === name ? { ...person, status: 'reading', error: undefined } : person
		);
		selectedSpeaker = name;
		selectedId = null;
		const mine = posts
			.filter((post) => post.from === name)
			.slice()
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
		if (!mine.length) {
			peopleReads = peopleReads.map((person) =>
				person.name === name
					? { ...person, status: 'error', error: 'No labeled messages.' }
					: person
			);
			return;
		}

		try {
			const response = await fetch('/api/classify', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...classifyAuthHeaders() },
				signal,
				body: JSON.stringify({
					id: speakerRequestId(name),
					from: name,
					chatType,
					kind: 'speaker',
					others,
					speakerMessages: mine.map((post) => ({
						date: post.date,
						text: post.text || (post.media ? `Media: ${post.media}` : '')
					})),
					model: config.model,
					provider: keyUi.provider,
					maxRetries: config.maxRetries,
					zeroDataRetention: config.zeroDataRetention,
					questions: toJevQuestions({ ...config, questions: toneQuestions })
				})
			});
			const payload = (await response.json()) as ClassifyResponse & { error?: string };
			if (response.status === 401) keyUi.open = true;
			if (!response.ok) throw new Error(payload.error || `Classify failed (${response.status})`);
			peopleReads = peopleReads.map((person) =>
				person.name === name
					? { ...person, status: 'done', classification: payload.classification }
					: person
			);
		} catch (error) {
			if (signal.aborted) {
				peopleReads = peopleReads.map((person) =>
					person.name === name ? { ...person, status: 'queued' } : person
				);
				return;
			}
			peopleReads = peopleReads.map((person) =>
				person.name === name
					? {
							...person,
							status: 'error',
							error: error instanceof Error ? error.message : 'Tone analysis failed.'
						}
					: person
			);
		}
	}

	async function classifyOne(index: number, signal: AbortSignal) {
		const post = posts[index];
		config = readConfig();
		if (!post) return;
		posts[index] = { ...post, status: 'reading', error: undefined };
		activeId = post.id;
		queueMicrotask(() => {
			feedEl
				?.querySelector(`[data-post="${post.id}"]`)
				?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});

		try {
			const response = await fetch('/api/classify', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...classifyAuthHeaders() },
				signal,
				body: JSON.stringify({
					id: post.id,
					text: post.text,
					date: post.date,
					from: post.from,
					fromId: post.fromId,
					media: post.media,
					forwardedFrom: post.forwardedFrom,
					replyToId: post.replyToId,
					chatType,
					threadContext: threadContext(archive, post),
					reactions: post.reactions,
					model: config.model,
					provider: keyUi.provider,
					maxRetries: config.maxRetries,
					zeroDataRetention: config.zeroDataRetention,
					questions: toJevQuestions(config)
				})
			});
			const payload = (await response.json()) as ClassifyResponse & { error?: string };
			if (response.status === 401) {
				keyUi.open = true;
			}
			if (!response.ok) throw new Error(payload.error || `Classify failed (${response.status})`);
			posts[index] = { ...posts[index], status: 'done', classification: payload.classification };
		} catch (error) {
			if (signal.aborted) {
				posts[index] = { ...posts[index], status: 'queued' };
				return;
			}
			posts[index] = {
				...posts[index],
				status: 'error',
				error: error instanceof Error ? error.message : 'Classify failed.'
			};
		}
	}

	function pause() {
		paused = true;
		abort?.abort();
		running = false;
	}

	function play() {
		void resumeRun();
	}

	function stop() {
		paused = false;
		abort?.abort();
		running = false;
		configOpen = true;
		activeId = null;
	}

	function download() {
		const blob = new Blob(
			[
				JSON.stringify(
					{
						name: channelName,
						type: chatType,
						file: fileName,
						mode,
						classifiedAt: new Date().toISOString(),
						config,
						people: peopleReads.map((person) => ({
							name: person.name,
							answers: person.classification?.answers ?? null,
							usage: person.classification?.usage ?? null,
							costUsd: person.classification?.costUsd ?? null,
							error: person.error ?? null
						})),
						totals,
						posts: posts.map((post) => ({
							id: post.id,
							date: post.date,
							from: post.from,
							text: post.text,
							media: post.media,
							reactions: post.reactions,
							answers: post.classification?.answers ?? null,
							usage: post.classification?.usage ?? null,
							costUsd: post.classification?.costUsd ?? null,
							error: post.error ?? null
						}))
					},
					null,
					2
				)
			],
			{ type: 'application/json' }
		);
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${channelName || mode}-classified.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function backToDrop() {
		abort?.abort();
		running = false;
		paused = false;
		archive = [];
		posts = [];
		channelName = '';
		fileName = '';
		fileError = '';
		chatType = null;
		speakers = [];
		peopleReads = [];
		selectedSpeaker = null;
		configOpen = true;
		selectedId = null;
		activeId = null;
		startedAt = null;
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		void onFile(event.dataTransfer?.files[0]);
	}

	function fieldClass() {
		return 'w-full rounded-[4px] border border-rule bg-paper px-2 py-1.5 font-mono text-[12px] outline-none focus:border-ink';
	}
</script>

<main
	class="mx-auto grid h-full min-h-0 max-w-[1280px] grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden"
>
	<section class="flex min-h-0 flex-col overflow-hidden border-rule lg:border-r">
		<div class="flex shrink-0 items-end justify-between gap-4 px-6 py-4">
			<div>
				<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">
					{isChat ? 'Duel / group' : 'Conversation'}
				</p>
				<h1 class="mt-1 text-[22px] font-medium tracking-tight">
					{channelName || (isChat ? 'No chat loaded' : 'No channel loaded')}
				</h1>
				{#if chatType}
					<p class="mt-1 font-mono text-[11px] text-mute">{chatType.replaceAll('_', ' ')}</p>
				{/if}
			</div>
			<div class="text-right font-mono text-[11px] text-mute">
				{#if posts.length}
					<div>{finished} / {posts.length} · {rate()}</div>
					<div>{formatTokens(totals.total)} tok · {formatUsd(totals.cost)}</div>
				{:else if archive.length}
					{matching.length} selected of {archive.length}
				{:else}
					awaiting export
				{/if}
			</div>
		</div>

		<div class="px-6">
			<div class="h-px w-full bg-rule">
				<div
					class="h-px bg-ink transition-[width] duration-300"
					style:width="{progress * 100}%"
				></div>
			</div>
		</div>

		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			{#if !archive.length}
				<div
					role="region"
					aria-label="Drop Telegram JSON export"
					class="m-6 flex min-h-0 flex-1 flex-col items-start justify-start rounded-[4px] border border-dashed p-8 transition-colors {dragOver
						? 'border-ink bg-soft'
						: 'border-rule bg-wash'}"
					ondragover={(event) => {
						event.preventDefault();
						dragOver = true;
					}}
					ondragleave={() => (dragOver = false)}
					ondrop={onDrop}
				>
					<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">Telegram export</p>
					<p class="mt-3 max-w-[28ch] text-[28px] leading-[1.15] font-medium tracking-tight">
						{isChat
							? 'Attach a private or group chat. Classify topic, intention, emotion.'
							: 'Place the JSON. Set the run, then classify.'}
					</p>
					<p class="mt-6 font-mono text-[12px] text-mute">
						{activeQuestions.length} questions · {config.model}
					</p>
					<div class="mt-5 flex flex-wrap items-center gap-3">
						<label
							class="cursor-pointer rounded-full bg-ink px-4 py-2 font-mono text-[11px] text-paper"
						>
							Choose JSON
							<input
								class="sr-only"
								type="file"
								accept="application/json,.json"
								onchange={(event) => void onFile(event.currentTarget.files?.[0])}
							/>
						</label>
						<button
							type="button"
							class="rounded-full border border-rule px-4 py-2 font-mono text-[11px]"
							onclick={() => void loadSample()}
						>
							{isChat ? 'Load 4-message sample' : 'Load 3-post sample'}
						</button>
					</div>
					{#if fileError}
						<p class="mt-4 font-mono text-[12px] text-ink">{fileError}</p>
					{/if}
				</div>
			{:else}
				<div class="min-h-0 flex-1 overflow-y-auto">
					<div class="border-b border-rule px-6 py-4">
						<div class="flex items-center justify-between gap-3">
							<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">
								{configOpen ? 'Run' : 'Feed'}
							</p>
							<div class="flex items-center gap-3">
								{#if !configOpen}
									<button
										type="button"
										class="font-mono text-[11px] text-mute underline-offset-4 hover:text-ink hover:underline"
										onclick={() => (configOpen = true)}
									>
										Run settings
									</button>
								{/if}
								<button
									type="button"
									class="font-mono text-[11px] text-mute underline-offset-4 hover:text-ink hover:underline"
									onclick={backToDrop}
								>
									Back
								</button>
							</div>
						</div>
						{#if configOpen}
							<p class="mt-2 font-mono text-[12px] text-mute">
								{archive.length} messages in file · {matching.length} will be classified
							</p>
							<div class="mt-4 grid gap-3 sm:grid-cols-2">
								<label class="block">
									<span class="font-mono text-[11px] text-mute">How many</span>
									<input
										class="{fieldClass()} mt-1"
										type="number"
										min="1"
										max={archive.length}
										bind:value={limit}
										disabled={busy}
									/>
								</label>
								<label class="block">
									<span class="font-mono text-[11px] text-mute">Order</span>
									<select class="{fieldClass()} mt-1" bind:value={order} disabled={busy}>
										<option value="newest">Newest first</option>
										<option value="oldest">Oldest first</option>
									</select>
								</label>
								<label class="block">
									<span class="font-mono text-[11px] text-mute">From</span>
									<input
										class="{fieldClass()} mt-1"
										type="date"
										min={bounds.min}
										max={bounds.max}
										bind:value={dateFrom}
										disabled={busy}
									/>
								</label>
								<label class="block">
									<span class="font-mono text-[11px] text-mute">To</span>
									<input
										class="{fieldClass()} mt-1"
										type="date"
										min={bounds.min}
										max={bounds.max}
										bind:value={dateTo}
										disabled={busy}
									/>
								</label>
							</div>
							<div class="mt-3 flex flex-wrap gap-4 font-mono text-[12px]">
								<label class="flex items-center gap-2">
									<input type="checkbox" bind:checked={requireText} disabled={busy} />
									Text required
								</label>
								<label class="flex items-center gap-2">
									<input type="checkbox" bind:checked={requireReactions} disabled={busy} />
									Has reactions
								</label>
								<label class="flex items-center gap-2">
									<input type="checkbox" bind:checked={skipForwards} disabled={busy} />
									Skip forwards
								</label>
							</div>
							{#if isChat && people.length}
								<div class="mt-4">
									<p class="font-mono text-[11px] text-mute">Speakers · empty means everyone</p>
									<div class="mt-2 flex flex-wrap gap-2">
										{#each people as person}
											<button
												type="button"
												class="rounded-full border px-2 py-0.5 font-mono text-[11px] {speakers.includes(
													person
												)
													? 'border-ink bg-ink text-paper'
													: 'border-rule'}"
												disabled={busy}
												onclick={() => toggleSpeaker(person)}
											>
												{person}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						{:else}
							<p class="mt-2 font-mono text-[12px] text-mute">
								{finished} of {posts.length} messages{#if isChat && peopleReads.length}
									· {peopleReads.filter((person) => person.status === 'done').length} of {peopleReads.length}
									people{/if}
							</p>
						{/if}
						<div class="mt-4 flex flex-wrap gap-2">
							{#if running || paused || (!configOpen && posts.length > 0 && workDone < workTotal)}
								{#if running}
									<button
										type="button"
										class="h-9 rounded-full bg-ink px-4 font-mono text-[11px] text-paper"
										onclick={pause}
									>
										Pause
									</button>
								{:else}
									<button
										type="button"
										class="h-9 rounded-full bg-ink px-4 font-mono text-[11px] text-paper"
										onclick={play}
									>
										Play
									</button>
								{/if}
								<button
									type="button"
									class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]"
									onclick={stop}
								>
									Stop
								</button>
							{:else if configOpen}
								<button
									type="button"
									class="h-9 rounded-full bg-ink px-4 font-mono text-[11px] text-paper disabled:opacity-40"
									disabled={!matching.length || !activeQuestions.length}
									onclick={() => void startRun()}
								>
									Classify {matching.length}
								</button>
								{#if posts.length && workDone < workTotal}
									<button
										type="button"
										class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]"
										onclick={() => void resumeRun()}
									>
										Resume
									</button>
								{/if}
							{/if}
						</div>
					</div>

					<div bind:this={feedEl} class="space-y-3 px-6 py-4">
						{#if isChat && peopleReads.length}
							<div class="mb-4 space-y-2">
								<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">People</p>
								{#each peopleReads as person (person.name)}
									<button
										type="button"
										class="w-full rounded-[4px] px-4 py-3 text-left transition-colors {person.name ===
										selectedSpeaker
											? 'bg-white outline outline-1 outline-ink'
											: 'hover:bg-soft'}"
										onclick={() => {
											selectedSpeaker = person.name;
											selectedId = null;
										}}
									>
										<div
											class="flex items-center justify-between gap-3 font-mono text-[11px] text-mute"
										>
											<span class="text-ink">{person.name}</span>
											<span
												>{posts.filter((post) => post.from === person.name).length} messages</span
											>
										</div>
										<div class="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
											{#if person.status === 'reading'}
												<span class="rounded-full bg-ink px-2 py-0.5 text-paper">reading tone</span>
											{:else if person.classification}
												{#each chipAnswers(person.classification.answers, toneQuestions) as chip}
													<span
														class="rounded-full border border-rule px-2 py-0.5 first:border-ink first:bg-ink first:text-paper"
														>{chip}</span
													>
												{/each}
												<span class="text-mute">{formatUsd(person.classification.costUsd)}</span>
											{:else if person.status === 'error'}
												<span class="rounded-full border border-ink px-2 py-0.5">failed</span>
											{:else}
												<span class="text-mute">tone queued</span>
											{/if}
										</div>
										{#if person.error}
											<p class="mt-2 font-mono text-[11px]">{person.error}</p>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
						{#each posts as post (post.id)}
							<button
								type="button"
								data-post={post.id}
								class="w-full rounded-[4px] px-4 py-3 text-left transition-colors {post.id ===
									viewing?.id && !selectedSpeaker
									? 'bg-white outline outline-1 outline-ink'
									: 'hover:bg-soft'}"
								onclick={() => {
									selectedId = post.id;
									selectedSpeaker = null;
								}}
							>
								<div
									class="flex items-center justify-between gap-3 font-mono text-[11px] text-mute"
								>
									<span>{post.from}</span>
									<span>{formatDate(post.date)}</span>
								</div>
								<p class="mt-2 line-clamp-5 text-[14px] leading-relaxed whitespace-pre-wrap">
									{post.text || `Media: ${post.media}`}
								</p>
								{#if post.reactions.length}
									<p class="mt-2 font-mono text-[11px] text-mute">
										{reactionSummary(post.reactions)}
									</p>
								{/if}
								<div class="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
									{#if post.status === 'reading'}
										<span class="rounded-full bg-ink px-2 py-0.5 text-paper">reading</span>
									{:else if post.classification}
										{#each chipAnswers(post.classification.answers, activeQuestions) as chip}
											<span
												class="rounded-full border border-rule px-2 py-0.5 first:border-ink first:bg-ink first:text-paper"
												>{chip}</span
											>
										{/each}
										<span class="text-mute">{formatUsd(post.classification.costUsd)}</span>
									{:else if post.status === 'error'}
										<span class="rounded-full border border-ink px-2 py-0.5">failed</span>
									{:else}
										<span class="text-mute">queued</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</section>

	<aside class="flex min-h-0 flex-col overflow-hidden bg-wash">
		<div class="flex shrink-0 items-start justify-between px-6 py-4">
			<div>
				<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">
					{selectedSpeaker ? 'Person' : 'Jev’s read'}
				</p>
				<p class="mt-1 font-mono text-[11px] text-mute">
					{#if selectedSpeaker}
						{selectedSpeaker}
					{:else}
						{viewing ? `message ${viewing.id}` : 'idle'}
					{/if}
					{#if running}
						· streaming
					{:else if paused}
						· paused
					{:else if doneCount}
						· {doneCount} labeled{#if errorCount}
							· {errorCount} failed{/if}
					{/if}
				</p>
			</div>
			{#if selectedSpeaker ? viewingPerson?.classification : viewing?.classification}
				{@const usage = selectedSpeaker ? viewingPerson?.classification : viewing?.classification}
				<p class="text-right font-mono text-[11px] text-mute">
					{formatTokens(usage?.usage.inputTokens)} in<br />
					{formatTokens(usage?.usage.outputTokens)} out<br />
					{formatUsd(usage?.costUsd ?? 0)}
				</p>
			{/if}
		</div>

		<div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-2">
			{#each asideQuestions as question (question.id)}
				<section>
					<div class="mb-3 flex items-center justify-between gap-3">
						<p class="font-mono text-[11px] text-mute">{question.label}</p>
						{#if !selectedSpeaker}
							<button
								type="button"
								class="flex size-5 items-center justify-center rounded-[3px] border border-ink font-mono text-[11px] {question.enabled
									? 'bg-ink text-paper'
									: 'bg-transparent text-transparent'}"
								aria-pressed={question.enabled}
								aria-label="{question.enabled ? 'Disable' : 'Enable'} {question.label}"
								onclick={() => toggleQuestion(question.id)}
							>
								✓
							</button>
						{/if}
					</div>
					{#if question.enabled}
						<Meters
							rows={metersFor(
								question,
								selectedSpeaker ? viewingPerson?.classification : viewing?.classification
							)}
						/>
					{/if}
				</section>
			{/each}

			{#if posts.length}
				<section>
					<p class="mb-3 font-mono text-[11px] text-mute">Tokens · cost</p>
					<p class="font-mono text-[12px] leading-relaxed">
						{formatTokens(totals.input)} in · {formatTokens(totals.output)} out<br />
						{formatTokens(totals.total)} total · {formatUsd(totals.cost)}
					</p>
					<p class="mt-2 font-mono text-[11px] text-mute">Jev input $0.042 / 1M tokens</p>
				</section>
			{/if}

			{#if mix.length}
				<section>
					<p class="mb-3 font-mono text-[11px] text-mute">Archive mix</p>
					<div class="flex flex-wrap gap-1.5">
						{#each mix as item}
							<span class="rounded-full border border-rule px-2 py-0.5 font-mono text-[11px]">
								{item.key}
								{item.count}
							</span>
						{/each}
					</div>
				</section>
			{/if}

			{#if viewingPerson?.error}
				<p class="font-mono text-[12px]">{viewingPerson.error}</p>
			{:else if viewing?.error}
				<p class="font-mono text-[12px]">{viewing.error}</p>
			{/if}
		</div>

		<div class="shrink-0 border-t border-rule bg-wash p-4">
			<label
				class="flex cursor-pointer items-center justify-between gap-4 rounded-[4px] border border-rule bg-paper px-4 py-3"
				ondragover={(event) => {
					event.preventDefault();
					dragOver = true;
				}}
				ondragleave={() => (dragOver = false)}
				ondrop={onDrop}
			>
				<div>
					<p class="text-[13px] font-medium">{fileName || 'Drop result.json'}</p>
					<p class="mt-1 font-mono text-[11px] text-mute">Uses the saved Settings questions</p>
				</div>
				<input
					class="sr-only"
					type="file"
					accept="application/json,.json"
					onchange={(event) => void onFile(event.currentTarget.files?.[0])}
				/>
			</label>
			<div class="mt-3 flex gap-2">
				<button
					type="button"
					class="h-9 flex-1 rounded-full border border-rule px-4 font-mono text-[11px] disabled:opacity-40"
					disabled={!doneCount}
					onclick={download}
				>
					Export labels
				</button>
			</div>
		</div>
	</aside>
</main>
