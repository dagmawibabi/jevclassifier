import fs from 'node:fs';
import path from 'node:path';

const temp = process.env.TEMP ?? process.env.TMPDIR ?? '/tmp';
const words = fs
	.readFileSync(path.join(temp, 'google-10k.txt'), 'utf8')
	.split(/\r?\n/)
	.map((word) => word.trim().toLowerCase())
	.filter(Boolean);
const webster = JSON.parse(fs.readFileSync(path.join(temp, 'webster.json'), 'utf8'));
const websterMap = new Map();
for (const [key, def] of Object.entries(webster)) {
	const lookup = key.toLowerCase().replace(/[^a-z0-9']/g, '');
	if (!lookup || websterMap.has(lookup)) continue;
	const text = String(def).replace(/\s+/g, ' ').trim().slice(0, 160);
	if (text) websterMap.set(lookup, text);
}

const extras = [
	['i', 'The speaker; first person singular pronoun.'],
	["i'm", 'Contraction of I am.'],
	["i'll", 'Contraction of I will.'],
	["i've", 'Contraction of I have.'],
	["i'd", 'Contraction of I would or I had.'],
	["you're", 'Contraction of you are.'],
	["you've", 'Contraction of you have.'],
	["you'll", 'Contraction of you will.'],
	["we're", 'Contraction of we are.'],
	["they're", 'Contraction of they are.'],
	["it's", 'Contraction of it is or it has.'],
	["that's", 'Contraction of that is.'],
	["there's", 'Contraction of there is.'],
	["let's", 'Contraction of let us.'],
	["don't", 'Contraction of do not.'],
	["can't", 'Contraction of cannot.'],
	["won't", 'Contraction of will not.'],
	["isn't", 'Contraction of is not.'],
	["aren't", 'Contraction of are not.'],
	["wasn't", 'Contraction of was not.'],
	["weren't", 'Contraction of were not.'],
	["didn't", 'Contraction of did not.'],
	["doesn't", 'Contraction of does not.'],
	["haven't", 'Contraction of have not.'],
	["hasn't", 'Contraction of has not.'],
	["wouldn't", 'Contraction of would not.'],
	["couldn't", 'Contraction of could not.'],
	["shouldn't", 'Contraction of should not.'],
	['ok', 'Informal yes or acknowledgment.'],
	['okay', 'Informal yes or acknowledgment.'],
	['yeah', 'Informal yes.'],
	['nope', 'Informal no.'],
	['hi', 'A greeting.'],
	['hello', 'A greeting.'],
	['hey', 'A casual greeting.'],
	['please', 'Polite request marker.'],
	['thanks', 'Expression of gratitude.'],
	['sorry', 'Apology or regret.']
];

const seen = new Set();
const entries = [];

function add(word, definition) {
	const surface = word.trim();
	if (!surface) return;
	const lookup = surface.toLowerCase();
	if (seen.has(lookup)) return;
	const key = lookup
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
		.slice(0, 40);
	if (!key) return;
	seen.add(lookup);
	entries.push({ key, word: surface, definition });
}

for (const [word, definition] of extras) add(word, definition);
for (const word of words) {
	if (!/^[a-z][a-z']{0,22}$/.test(word)) continue;
	const def =
		websterMap.get(word.replace(/'/g, '')) ||
		websterMap.get(word) ||
		`Common English word: ${word}.`;
	add(word, def);
}

entries.sort((a, b) => a.word.localeCompare(b.word));
const used = new Set();
for (const entry of entries) {
	let key = entry.key;
	let n = 2;
	while (used.has(key)) {
		key = `${entry.key}_${n}`.slice(0, 40);
		n += 1;
	}
	entry.key = key;
	used.add(key);
}

const outDir = path.resolve('src/lib/data');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'dictionary.json');
fs.writeFileSync(outFile, JSON.stringify(entries));
console.log(entries.length, 'entries', `${(fs.statSync(outFile).size / 1024).toFixed(1)}kb`);
