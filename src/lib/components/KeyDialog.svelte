<script lang="ts">
	import { GATEWAY_JEV_MODEL, TYPESAFE_JEV_MODEL, type JevProvider } from '$lib/cost';
	import { clearApiKey, keyUi, loadApiKey, saveApiKey, saveProvider } from '$lib/key.svelte';

	let value = $state('');
	let message = $state('');
	let reveal = $state(false);

	const envForSelected = $derived(
		keyUi.provider === 'typesafe' ? keyUi.hasTypesafeEnv : keyUi.hasGatewayEnv
	);
	const localForSelected = $derived(
		keyUi.provider === 'typesafe' ? keyUi.hasTypesafeLocal : keyUi.hasGatewayLocal
	);
	const masked = $derived(localForSelected ? '•••••••• saved in this browser' : '');
	const placeholder = $derived(
		masked || (keyUi.provider === 'typesafe' ? 'TypeSafe key' : 'vck_…')
	);

	function fillForProvider(provider: JevProvider) {
		value = loadApiKey(provider);
		reveal = false;
		message = '';
	}

	let wasOpen = $state(false);

	$effect(() => {
		const open = keyUi.open;
		if (open && !wasOpen) fillForProvider(keyUi.provider);
		wasOpen = open;
	});

	function close() {
		keyUi.open = false;
		value = '';
		message = '';
		reveal = false;
	}

	function select(next: JevProvider) {
		saveProvider(next);
		fillForProvider(next);
	}

	function save() {
		saveProvider(keyUi.provider);
		if (value.trim()) saveApiKey(keyUi.provider, value);
		close();
	}

	function clear() {
		clearApiKey(keyUi.provider);
		value = '';
		reveal = false;
		message = 'Browser key cleared for this provider.';
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && keyUi.open) close();
	}

	function optionClass(active: boolean) {
		return `rounded-full border px-3 py-1.5 font-mono text-[11px] ${
			active ? 'border-ink bg-ink text-paper' : 'border-rule'
		}`;
	}
</script>

<svelte:window onkeydown={onKey} />

{#if keyUi.open}
	<div class="fixed inset-0 z-50 flex items-center justify-center px-4">
		<button type="button" class="absolute inset-0 bg-ink/40" aria-label="Close key dialog" onclick={close}></button>
		<div
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-labelledby="key-title"
			class="relative z-10 w-full max-w-md rounded-[4px] border border-rule bg-paper p-6"
		>
			<p id="key-title" class="text-[18px] font-medium tracking-tight">API key</p>
			<p class="mt-2 font-mono text-[12px] leading-relaxed text-mute">
				Jev can run through Vercel AI Gateway or TypeSafe’s API. Env keys win over a browser key for the provider you pick.
			</p>

			<div class="mt-4 flex flex-wrap gap-2">
				<button type="button" class={optionClass(keyUi.provider === 'gateway')} onclick={() => select('gateway')}>
					AI Gateway
				</button>
				<button type="button" class={optionClass(keyUi.provider === 'typesafe')} onclick={() => select('typesafe')}>
					TypeSafe
				</button>
			</div>

			<p class="mt-4 font-mono text-[12px] leading-relaxed">
				{#if keyUi.provider === 'gateway'}
					{#if envForSelected}
						<span class="text-ink">AI_GATEWAY_API_KEY</span> is set in .env. That one is used. Model {GATEWAY_JEV_MODEL}.
					{:else}
						No <span class="text-ink">AI_GATEWAY_API_KEY</span> in .env. Paste a Vercel AI Gateway key to run from this browser.
					{/if}
				{:else if envForSelected}
					<span class="text-ink">JEV_API_KEY</span> is set in .env. That one is used. Model {TYPESAFE_JEV_MODEL}.
				{:else}
					No <span class="text-ink">JEV_API_KEY</span> in .env. Paste a TypeSafe key, or set JEV_API_KEY / TYPESAFE_API_KEY.
				{/if}
			</p>

			<p class="mt-3 font-mono text-[12px]">
				{#if keyUi.provider === 'gateway'}
					<a
						class="text-ink underline underline-offset-4"
						href="https://vercel.com/ai-gateway"
						target="_blank"
						rel="noreferrer">Vercel AI Gateway</a
					>
					<span class="text-mute"> · </span>
					<a
						class="text-ink underline underline-offset-4"
						href="https://vercel.com/ai-gateway/models/jev"
						target="_blank"
						rel="noreferrer">Jev on Gateway</a
					>
				{:else}
					<a
						class="text-ink underline underline-offset-4"
						href="https://docs.typesafe.ai/introduction/quickstart"
						target="_blank"
						rel="noreferrer">TypeSafe quickstart</a
					>
					<span class="text-mute"> · </span>
					<a
						class="text-ink underline underline-offset-4"
						href="https://console.typesafe.ai/settings/keys"
						target="_blank"
						rel="noreferrer">API keys</a
					>
				{/if}
			</p>

			<div class="mt-5">
				<span class="font-mono text-[11px] text-mute">
					{keyUi.provider === 'typesafe' ? 'TypeSafe API key' : 'Gateway API key'}
				</span>
				<div class="relative mt-1">
					<input
						class="w-full rounded-[4px] border border-rule bg-wash py-2 pr-10 pl-3 font-mono text-[12px] outline-none focus:border-ink"
						type={reveal ? 'text' : 'password'}
						autocomplete="off"
						spellcheck="false"
						placeholder={placeholder}
						bind:value
					/>
					<button
						type="button"
						class="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center text-mute hover:text-ink"
						aria-label={reveal ? 'Hide API key' : 'Show API key'}
						aria-pressed={reveal}
						onclick={() => (reveal = !reveal)}
					>
						{#if reveal}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="size-4" aria-hidden="true">
								<path
									stroke="currentColor"
									stroke-width="1.6"
									stroke-linecap="round"
									d="M3.5 3.5 20.5 20.5M9.9 9.9A3.2 3.2 0 0 0 12 15.2a3.2 3.2 0 0 0 3.1-2.4"
								/>
								<path
									stroke="currentColor"
									stroke-width="1.6"
									stroke-linecap="round"
									d="M6.7 6.9C4.6 8.2 3.2 10 2.6 12c1.5 5 5.2 8 9.4 8 1.8 0 3.5-.5 5-.1M17.4 15.3c1.7-1.2 3-2.9 3.6-4.3-1.5-5-5.2-8-9.4-8-1 0-2 .2-2.9.5"
								/>
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="size-4" aria-hidden="true">
								<path
									stroke="currentColor"
									stroke-width="1.6"
									stroke-linejoin="round"
									d="M2.6 12c1.5-5 5.2-8 9.4-8s7.9 3 9.4 8c-1.5 5-5.2 8-9.4 8s-7.9-3-9.4-8Z"
								/>
								<circle cx="12" cy="12" r="3.1" stroke="currentColor" stroke-width="1.6" />
							</svg>
						{/if}
					</button>
				</div>
			</div>
			<p class="mt-2 font-mono text-[11px] text-mute">
				Browser fallback only. Never required when the matching .env key is present.
			</p>
			{#if message}
				<p class="mt-3 font-mono text-[12px] text-mute">{message}</p>
			{/if}
			<div class="mt-6 flex flex-wrap gap-2">
				<button type="button" class="h-9 rounded-full bg-ink px-4 font-mono text-[11px] text-paper" onclick={save}>
					Save
				</button>
				<button type="button" class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]" onclick={close}>
					Close
				</button>
				<button type="button" class="h-9 rounded-full border border-rule px-4 font-mono text-[11px]" onclick={clear}>
					Clear
				</button>
			</div>
		</div>
	</div>
{/if}
