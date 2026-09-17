export const CATEGORIES = {
	tech: 'Software, hardware, programming, products, and digital tools.',
	quote: 'Aphorisms, copied sayings, or inspirational one-liners.',
	job: 'Hiring, roles, CVs, freelance gigs, or career news.',
	event: 'Meetups, launches, deadlines, or time-bound happenings.',
	spiritual: 'Faith, prayer, scripture, or religious teaching.',
	personal: 'Diary-like notes, feelings, life updates, or selfies with caption.',
	news: 'Current events, reports, or civic information.',
	promo: 'Ads, discounts, giveaways, or sales pitches.',
	education: 'Tutorials, study notes, how-tos, or explanations.',
	humor: 'Jokes, memes, or playful entertainment.',
	other: 'Does not fit the categories above.'
} as const;

export type Category = keyof typeof CATEGORIES;

export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITY_LEVELS)[number];

export function qualityFromScore(score: number): Quality {
	if (score < 0.66) return 'low';
	if (score < 1.34) return 'medium';
	return 'high';
}
