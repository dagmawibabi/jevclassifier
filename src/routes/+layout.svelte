<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import KeyDialog from '$lib/components/KeyDialog.svelte';
	import { keyUi, refreshGatewayStatus } from '$lib/key.svelte';

	let { children } = $props();
	const path = $derived(page.url.pathname);
	const keyReady = $derived(
		keyUi.provider === 'typesafe'
			? keyUi.hasTypesafeEnv || keyUi.hasTypesafeLocal
			: keyUi.hasGatewayEnv || keyUi.hasGatewayLocal
	);

	onMount(() => {
		void refreshGatewayStatus();
	});
</script>

<svelte:head>
	<title>Classify</title>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
	<header class="flex shrink-0 items-center justify-between gap-4 border-b border-rule px-6 py-3">
		<div class="flex min-w-0 items-baseline gap-6">
			<p class="text-[15px] font-semibold tracking-tight">Classify</p>
			<nav class="flex items-center gap-4 font-mono text-[11px]">
				<a class={path === '/' ? 'text-ink' : 'text-mute'} href="/">Run</a>
				<a class={path.startsWith('/duel') ? 'text-ink' : 'text-mute'} href="/duel">Duel/Group</a>
				<a class={path.startsWith('/settings') ? 'text-ink' : 'text-mute'} href="/settings">Settings</a>
				<button
					type="button"
					class={keyReady ? 'text-ink' : 'text-mute'}
					onclick={() => (keyUi.open = true)}
				>
					Key
				</button>
			</nav>
		</div>
		<a
			class="hidden truncate font-mono text-[11px] text-mute underline-offset-4 hover:text-ink hover:underline sm:block"
			href="https://vercel.com/ai-gateway/models/jev"
			target="_blank"
			rel="noreferrer"
		>
			Jev
		</a>
	</header>
	<div class="min-h-0 flex-1 overflow-hidden">
		{@render children()}
	</div>
</div>

<KeyDialog />
