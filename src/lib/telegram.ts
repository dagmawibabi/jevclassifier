export type Reaction = {
	emoji: string;
	count: number;
};

export type ChannelPost = {
	id: number;
	date: string;
	from: string;
	fromId: string | null;
	text: string;
	media: string | null;
	forwardedFrom: string | null;
	replyToId: number | null;
	views: number | null;
	reactions: Reaction[];
};

export type ChannelExport = {
	name: string;
	type: string | null;
	posts: ChannelPost[];
};

type TelegramMessage = {
	id?: number;
	type?: string;
	date?: string;
	from?: string;
	from_id?: string;
	author?: string;
	actor?: string;
	text?: unknown;
	photo?: unknown;
	file?: unknown;
	file_name?: string;
	media_type?: string;
	forwarded_from?: string;
	reply_to_message_id?: number;
	views?: string | number;
	reactions?: unknown;
};

function flattenText(text: unknown): string {
	if (typeof text === 'string') return text.trim();
	if (!Array.isArray(text)) return '';
	return text
		.map((part) => {
			if (typeof part === 'string') return part;
			if (part && typeof part === 'object' && 'text' in part) {
				return String((part as { text: unknown }).text ?? '');
			}
			return '';
		})
		.join('')
		.trim();
}

function mediaLabel(message: TelegramMessage): string | null {
	if (message.photo) return 'photo';
	if (message.media_type) return String(message.media_type);
	if (message.file_name) return String(message.file_name);
	if (message.file) return 'file';
	return null;
}

function parseReactions(value: unknown): Reaction[] {
	if (!Array.isArray(value)) return [];
	const reactions: Reaction[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		const count = Number(record.count ?? 0);
		if (!count) continue;
		const emoji =
			typeof record.emoji === 'string' && record.emoji
				? record.emoji
				: typeof record.document_id === 'string'
					? `custom:${record.document_id.slice(-6)}`
					: 'custom';
		reactions.push({ emoji, count });
	}
	return reactions;
}

export function reactionSummary(reactions: Reaction[]) {
	if (reactions.length === 0) return 'none';
	return reactions.map((reaction) => `${reaction.emoji}×${reaction.count}`).join(', ');
}

function asMessages(data: unknown): { name: string; type: string | null; messages: TelegramMessage[] } {
	if (Array.isArray(data)) {
		return { name: 'Untitled export', type: null, messages: data as TelegramMessage[] };
	}

	if (data && typeof data === 'object') {
		const record = data as Record<string, unknown>;
		const name = typeof record.name === 'string' ? record.name : 'Untitled export';
		const type = typeof record.type === 'string' ? record.type : null;
		if (Array.isArray(record.messages)) {
			return { name, type, messages: record.messages as TelegramMessage[] };
		}
	}

	throw new Error('JSON must be a Telegram export ({ name, messages }) or an array of messages.');
}

export function parseChannelExport(data: unknown): ChannelExport {
	const { name, type, messages } = asMessages(data);
	const posts: ChannelPost[] = [];

	for (const message of messages) {
		if (message.type && message.type !== 'message') continue;
		const text = flattenText(message.text);
		const media = mediaLabel(message);
		if (!text && !media) continue;

		posts.push({
			id: Number(message.id ?? posts.length + 1),
			date: typeof message.date === 'string' ? message.date : '',
			from: String(message.from ?? message.author ?? message.actor ?? name),
			fromId: typeof message.from_id === 'string' ? message.from_id : null,
			text,
			media,
			forwardedFrom: message.forwarded_from ? String(message.forwarded_from) : null,
			replyToId: message.reply_to_message_id == null ? null : Number(message.reply_to_message_id),
			views: message.views == null ? null : Number(message.views),
			reactions: parseReactions(message.reactions)
		});
	}

	if (posts.length === 0) {
		throw new Error('No classifiable messages found in this file.');
	}

	return { name, type, posts };
}

export type PostFilter = {
	dateFrom: string;
	dateTo: string;
	requireText: boolean;
	requireReactions: boolean;
	skipForwards: boolean;
	speakers: string[];
	newestFirst: boolean;
	limit: number;
};

export function postDay(date: string) {
	return date.slice(0, 10);
}

export function dateBounds(posts: ChannelPost[]) {
	const days = posts.map((post) => postDay(post.date)).filter(Boolean).sort();
	return { min: days[0] ?? '', max: days.at(-1) ?? '' };
}

export function speakersOf(posts: ChannelPost[]) {
	return [...new Set(posts.map((post) => post.from).filter(Boolean))].sort();
}

export function filterPosts(posts: ChannelPost[], filter: PostFilter) {
	const from = filter.dateFrom || '0000-01-01';
	const to = filter.dateTo || '9999-12-31';
	const next = posts.filter((post) => {
		const day = postDay(post.date);
		if (day && (day < from || day > to)) return false;
		if (filter.requireText && !post.text.trim()) return false;
		if (filter.requireReactions && post.reactions.length === 0) return false;
		if (filter.skipForwards && post.forwardedFrom) return false;
		if (filter.speakers.length && !filter.speakers.includes(post.from)) return false;
		return true;
	});
	next.sort((a, b) => {
		const delta = new Date(a.date).getTime() - new Date(b.date).getTime();
		return filter.newestFirst ? -delta : delta;
	});
	const limit = Math.max(1, Math.floor(Number(filter.limit)) || next.length);
	return next.slice(0, Math.min(limit, next.length));
}

export function threadContext(archive: ChannelPost[], target: ChannelPost, window = 4) {
	const chronological = [...archive].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
	);
	const byId = new Map(chronological.map((post) => [post.id, post]));
	const index = chronological.findIndex((post) => post.id === target.id);
	const lines: string[] = [];
	if (target.replyToId != null) {
		const replied = byId.get(target.replyToId);
		if (replied) {
			const snippet = (replied.text || replied.media || '').slice(0, 240);
			lines.push(`reply_to ${replied.from}: ${snippet}`);
		}
	}
	if (index >= 0) {
		for (const post of chronological.slice(Math.max(0, index - window), index)) {
			const snippet = (post.text || post.media || '').slice(0, 240);
			lines.push(`${post.from}: ${snippet}`);
		}
	}
	return lines.join('\n').slice(0, 2000);
}
