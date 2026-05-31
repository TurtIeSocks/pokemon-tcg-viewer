import { gzipSync } from "node:zlib";
import type { CorpusCard } from "../src/store/corpus/corpus-types";

const ORIGIN = "https://api.pokemontcg.io";
const PAGE_SIZE = 250;
const SELECT =
	"id,name,number,images,rarity,subtypes,supertype,types,set,nationalPokedexNumbers,tcgplayer";

interface ApiCard {
	id: string;
	name: string;
	number: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	types?: string[];
	nationalPokedexNumbers?: number[];
	set: { id: string };
	images: { small: string; large: string };
	tcgplayer?: { prices?: Record<string, unknown> };
}

export function trimCard(card: ApiCard): CorpusCard {
	const out: CorpusCard = {
		id: card.id,
		name: card.name,
		imageUrl: card.images.large,
		imageUrlSmall: card.images.small,
		supertype: card.supertype,
		setId: card.set.id,
		number: card.number,
	};
	if (card.rarity) out.rarity = card.rarity;
	if (card.subtypes) out.subtypes = card.subtypes;
	if (card.types) out.types = card.types;
	if (card.nationalPokedexNumbers)
		out.nationalPokedexNumbers = card.nationalPokedexNumbers;
	if (card.tcgplayer?.prices) out.variants = Object.keys(card.tcgplayer.prices);
	return out;
}

async function fetchPage(apiKey: string, page: number) {
	const url = `${ORIGIN}/v2/cards?select=${SELECT}&orderBy=set.releaseDate,number&page=${page}&pageSize=${PAGE_SIZE}`;
	const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
	if (!res.ok) throw new Error(`page ${page}: ${res.status}`);
	return (await res.json()) as { data: ApiCard[]; totalCount: number };
}

export async function buildCorpus(apiKey: string): Promise<CorpusCard[]> {
	const first = await fetchPage(apiKey, 1);
	const total = first.totalCount;
	const pages = Math.ceil(total / PAGE_SIZE);
	const cards: CorpusCard[] = first.data.map(trimCard);
	for (let p = 2; p <= pages; p++) {
		const { data } = await fetchPage(apiKey, p);
		for (const c of data) cards.push(trimCard(c));
	}
	if (cards.length < total * 0.95) {
		throw new Error(`crawl incomplete: got ${cards.length} of ${total}`);
	}
	return cards;
}

// Entrypoint: `bun run scripts/build-corpus.ts <outfile>`
if (import.meta.main) {
	const apiKey = process.env.POKEMONTCG_API_KEY;
	if (!apiKey) throw new Error("POKEMONTCG_API_KEY not set");
	const outfile = process.argv[2] ?? "corpus.json.gz";
	const cards = await buildCorpus(apiKey);
	const gz = gzipSync(Buffer.from(JSON.stringify(cards)));
	await Bun.write(outfile, gz);
	console.log(`wrote ${cards.length} cards → ${outfile} (${gz.length} bytes)`);
}
