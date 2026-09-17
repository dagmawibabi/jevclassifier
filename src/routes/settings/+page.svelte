<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		defaultConfig,
		loadChatConfig,
		loadConfig,
		newQuestion,
		resetChatConfig,
		resetConfig,
		saveChatConfig,
		saveConfig,
		validateConfig,
		type QuestionConfig,
		type RunConfig
	} from '$lib/config';
	import { GATEWAY_JEV_MODEL, JEV_INPUT_USD_PER_MILLION, TYPESAFE_JEV_MODEL } from '$lib/cost';

	let kind = $state<'channel' | 'chat'>('channel');
	let config = $state<RunConfig>(defaultConfig());
	let selected = $state(0);
	let message = $state('');
	let error = $state('');

	const current = $derived(config.questions[selected] ?? null);
	const enabledCount = $derived(config.questions.filter((question) => question.enabled).length);

	onMount(() => {
		config = loadConfig();
	});

	function switchKind(next: 'channel' | 'chat') {
		kind = next;
		config = next === 'chat' ? loadChatConfig() : loadConfig();
		selected = 0;
		error = '';
		message = '';
	}

	function persist(next = config) {
		const problem = validateConfig(next);
		if (problem) {
			error = problem;
			message = '';
			return false;
		}
		config = kind === 'chat' ? saveChatConfig(next) : saveConfig(next);
		error = '';
		message = 'Saved. The next run uses this config.';
		return true;
	}

	function updateQuestion(patch: Partial<QuestionConfig>) {
		if (!current) return;
		const questions = config.questions.map((question, index) =>
			index === selected ? ({ ...question, ...patch } as QuestionConfig) : question
		);
		config = { ...config, questions };
	}

	function addQuestion(type: QuestionConfig['type']) {
		config = { ...config, questions: [...config.questions, newQuestion(type)] };
		selected = config.questions.length - 1;
	}

	function removeQuestion(index: number) {
		const questions = config.questions.filter((_, i) => i !== index);
		config = { ...config, questions };
		selected = Math.min(selected, Math.max(0, questions.length - 1));
	}

	function move(index: number, delta: number) {
		const next = index + delta;
		if (next < 0 || next >= config.questions.length) return;
		const questions = [...config.questions];
		[questions[index], questions[next]] = [questions[next], questions[index]];
		config = { ...config, questions };
		selected = next;
	}

	function addOption() {
		if (current?.type !== 'choice') return;
		updateQuestion({
			options: [...current.options, { key: `option_${current.options.length + 1}`, description: '' }]
		});
	}

	function addLevel() {
		if (current?.type !== 'score') return;
		updateQuestion({ levels: [...current.levels, `Level ${current.levels.length + 1}`] });
	}

	function restoreDefaults() {
		config = kind === 'chat' ? resetChatConfig() : resetConfig();
		selected = 0;
		error = '';
		message = 'Restored the default Jev questions.';
	}

	function exportConfig() {
		const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
				link.download = kind === 'chat' ? 'jev-chat-config.json' : 'jev-config.json';
		link.click();
		URL.revokeObjectURL(url);
	}

	async function importConfig(file: File | undefined) {
		if (!file) return;
		try {
			const imported = JSON.parse(await file.text()) as RunConfig;
			config = kind === 'chat' ? saveChatConfig(imported) : saveConfig(imported);
			selected = 0;
			error = '';
			message = 'Imported and saved.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not import that config.';
		}
	}

	function saveAndRun() {
		if (!persist()) return;
		void goto(kind === 'chat' ? '/duel' : '/');
	}

	function fieldClass() {
		return 'w-full rounded-[4px] border border-rule bg-paper px-3 py-2 font-mono text-[12px] outline-none focus:border-ink';
	}
</script>

<main class="mx-auto grid h-full min-h-0 max-w-[1280px] grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
	<aside class="flex min-h-0 flex-col overflow-hidden border-rule lg:border-r">
		<div class="shrink-0 px-6 py-5">
			<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">Questions</p>
			<h1 class="mt-1 text-[22px] font-medium tracking-tight">Jev config</h1>
			<div class="mt-3 flex gap-3 font-mono text-[11px]">
				<button
					type="button"
					class={kind === 'channel' ? 'text-ink' : 'text-mute'}
					onclick={() => switchKind('channel')}>Channel</button
				>
				<button type="button" class={kind === 'chat' ? 'text-ink' : 'text-mute'} onclick={() => switchKind('chat')}
					>Duel/Group</button
				>
			</div>
			<p class="mt-2 font-mono text-[11px] text-mute">{enabledCount} enabled · {config.questions.length} total</p>
		</div>
		<div class="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
			{#each config.questions as question, index (question.id + index)}
				<button
					type="button"
					class="flex w-full items-center justify-between rounded-[4px] px-3 py-2 text-left {index === selected
						? 'bg-white outline outline-1 outline-ink'
						: 'hover:bg-soft'}"
					onclick={() => (selected = index)}
				>
					<span class="truncate text-[13px]">{question.label}</span>
					<span class="font-mono text-[10px] text-mute">{question.enabled ? question.type : 'off'}</span>
				</button>
			{/each}
		</div>
		<div class="shrink-0 flex flex-wrap gap-2 px-6 py-4">
			<button
				type="button"
				class="rounded-full border border-rule px-3 py-1.5 font-mono text-[11px]"
				onclick={() => addQuestion('choice')}>+ choice</button
			>
			<button
				type="button"
				class="rounded-full border border-rule px-3 py-1.5 font-mono text-[11px]"
				onclick={() => addQuestion('score')}>+ score</button
			>
			<button
				type="button"
				class="rounded-full border border-rule px-3 py-1.5 font-mono text-[11px]"
				onclick={() => addQuestion('boolean')}>+ boolean</button
			>
		</div>
	</aside>

	<section class="min-h-0 overflow-y-auto px-6 py-5">
			<div class="mb-8 grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="font-mono text-[11px] text-mute">Model</span>
					<input class="{fieldClass()} mt-1" bind:value={config.model} />
					<p class="mt-1 font-mono text-[11px] text-mute">
						Gateway {GATEWAY_JEV_MODEL} · TypeSafe {TYPESAFE_JEV_MODEL}
					</p>
				</label>
				<label class="block">
					<span class="font-mono text-[11px] text-mute">Concurrency</span>
					<input class="{fieldClass()} mt-1" type="number" min="1" max="8" bind:value={config.concurrency} />
				</label>
				<label class="block">
					<span class="font-mono text-[11px] text-mute">Max retries</span>
					<input class="{fieldClass()} mt-1" type="number" min="0" max="6" bind:value={config.maxRetries} />
				</label>
				<label class="flex items-end gap-3 pb-2">
					<input type="checkbox" bind:checked={config.zeroDataRetention} />
					<span class="font-mono text-[12px]">Zero data retention on Gateway</span>
				</label>
			</div>
			<p class="mb-8 font-mono text-[11px] text-mute">
				Jev answers choice, score, and boolean questions in one request. Input tokens are billed at ${JEV_INPUT_USD_PER_MILLION}
				/ 1M.
			</p>

			{#if current}
				<div class="mb-4 flex items-center justify-between gap-3">
					<p class="font-mono text-[11px] tracking-[0.18em] text-mute uppercase">Question</p>
					<div class="flex gap-2">
						<button class="font-mono text-[11px] text-mute" type="button" onclick={() => move(selected, -1)}>up</button>
						<button class="font-mono text-[11px] text-mute" type="button" onclick={() => move(selected, 1)}>down</button>
						<button class="font-mono text-[11px] text-mute" type="button" onclick={() => removeQuestion(selected)}
							>remove</button
						>
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="font-mono text-[11px] text-mute">Id</span>
						<input
							class="{fieldClass()} mt-1"
							value={current.id}
							oninput={(event) => updateQuestion({ id: event.currentTarget.value })}
						/>
					</label>
					<label class="block">
						<span class="font-mono text-[11px] text-mute">Label</span>
						<input
							class="{fieldClass()} mt-1"
							value={current.label}
							oninput={(event) => updateQuestion({ label: event.currentTarget.value })}
						/>
					</label>
				</div>

				<label class="mt-4 flex items-center gap-3">
					<input
						type="checkbox"
						checked={current.enabled}
						onchange={(event) => updateQuestion({ enabled: event.currentTarget.checked })}
					/>
					<span class="font-mono text-[12px]">Enabled on the next run</span>
				</label>

				<label class="mt-4 block">
					<span class="font-mono text-[11px] text-mute">Instructions</span>
					<textarea
						class="{fieldClass()} mt-1 min-h-28 font-sans text-[13px] leading-relaxed"
						value={current.instructions}
						oninput={(event) => updateQuestion({ instructions: event.currentTarget.value })}
					></textarea>
				</label>

				{#if current.type === 'choice'}
					<div class="mt-6">
						<div class="mb-3 flex items-center justify-between">
							<p class="font-mono text-[11px] text-mute">Options</p>
							<button class="font-mono text-[11px]" type="button" onclick={addOption}>add option</button>
						</div>
						<div class="space-y-2">
							{#each current.options as option, index}
								<div class="grid grid-cols-[140px_minmax(0,1fr)_auto] gap-2">
									<input
										class={fieldClass()}
										value={option.key}
										oninput={(event) => {
											const options = current.options.map((item, i) =>
												i === index ? { ...item, key: event.currentTarget.value } : item
											);
											updateQuestion({ options });
										}}
									/>
									<input
										class={fieldClass()}
										value={option.description}
										oninput={(event) => {
											const options = current.options.map((item, i) =>
												i === index ? { ...item, description: event.currentTarget.value } : item
											);
											updateQuestion({ options });
										}}
									/>
									<button
										class="font-mono text-[11px] text-mute"
										type="button"
										onclick={() =>
											updateQuestion({ options: current.options.filter((_, i) => i !== index) })}>x</button
									>
								</div>
							{/each}
						</div>
					</div>
				{:else if current.type === 'score'}
					<div class="mt-6">
						<div class="mb-3 flex items-center justify-between">
							<p class="font-mono text-[11px] text-mute">Levels, low to high</p>
							<button class="font-mono text-[11px]" type="button" onclick={addLevel}>add level</button>
						</div>
						<div class="space-y-2">
							{#each current.levels as level, index}
								<div class="flex gap-2">
									<span class="w-6 pt-2 font-mono text-[11px] text-mute">{index}</span>
									<input
										class={fieldClass()}
										value={level}
										oninput={(event) => {
											const levels = current.levels.map((item, i) =>
												i === index ? event.currentTarget.value : item
											);
											updateQuestion({ levels });
										}}
									/>
									<button
										class="font-mono text-[11px] text-mute"
										type="button"
										onclick={() => updateQuestion({ levels: current.levels.filter((_, i) => i !== index) })}
										>x</button
									>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<div class="mt-6 grid gap-4 sm:grid-cols-2">
						<label class="block">
							<span class="font-mono text-[11px] text-mute">True</span>
							<input
								class="{fieldClass()} mt-1"
								value={current.trueDescription}
								oninput={(event) => updateQuestion({ trueDescription: event.currentTarget.value })}
							/>
						</label>
						<label class="block">
							<span class="font-mono text-[11px] text-mute">False</span>
							<input
								class="{fieldClass()} mt-1"
								value={current.falseDescription}
								oninput={(event) => updateQuestion({ falseDescription: event.currentTarget.value })}
							/>
						</label>
					</div>
				{/if}
			{/if}

			<div class="mt-10 flex flex-wrap gap-2">
				<button
					type="button"
					class="h-9 rounded-full bg-ink px-4 font-mono text-[11px] text-paper"
					onclick={() => persist()}>Save</button
				>
				<button
					type="button"
					class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]"
					onclick={saveAndRun}>Save and run</button
				>
				<button type="button" class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]" onclick={restoreDefaults}
					>Restore defaults</button
				>
				<button type="button" class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]" onclick={exportConfig}
					>Export JSON</button
				>
				<label class="flex h-9 cursor-pointer items-center rounded-full border border-rule px-4 font-mono text-[11px]">
					Import JSON
					<input
						class="sr-only"
						type="file"
						accept="application/json,.json"
						onchange={(event) => void importConfig(event.currentTarget.files?.[0])}
					/>
				</label>
			</div>
			{#if error}
				<p class="mt-4 font-mono text-[12px]">{error}</p>
			{:else if message}
				<p class="mt-4 font-mono text-[12px] text-mute">{message}</p>
			{/if}
	</section>
</main>
