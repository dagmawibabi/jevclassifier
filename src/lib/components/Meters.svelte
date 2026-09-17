<script lang="ts">
	let { rows }: { rows: { key: string; value: number }[] } = $props();

	function pct(value: number) {
		return `${Math.round(value * 100)}%`;
	}
</script>

<div class="space-y-2">
	{#each rows as row (row.key)}
		<div class="grid grid-cols-[88px_minmax(0,1fr)_36px] items-center gap-3">
			<span class="truncate font-mono text-[11px] {row.value > 0.05 ? 'text-ink' : 'text-mute'}">{row.key}</span>
			<div class="h-[7px] overflow-hidden rounded-full bg-soft">
				<div class="h-full rounded-full bg-ink transition-[width] duration-500" style:width={pct(row.value)}></div>
			</div>
			<span class="text-right font-mono text-[11px] text-mute">{pct(row.value)}</span>
		</div>
	{/each}
</div>
