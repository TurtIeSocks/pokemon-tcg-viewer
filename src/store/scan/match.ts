import type { PokemonSet } from "@/server/card-mappers";
import type { CorpusCard } from "../corpus/corpus-types";
import { editDistance, normalize } from "../corpus/fuzzy";
import type { NumberReading, ScanCandidate } from "./scan-types";

const nameScore = (guess: string | null, cardName: string): number => {
	if (!guess) return 0.5; // unknown name neither helps nor hurts
	const a = normalize(guess);
	const b = normalize(cardName);
	if (!a || !b) return 0.5;
	const dist = editDistance(a, b);
	return Math.max(0, 1 - dist / Math.max(a.length, b.length));
};

/**
 * Canonicalize a card number for comparison. Purely numeric readings
 * ("086") strip leading zeros so they compare equal to the corpus's
 * unpadded form ("86"). Non-numeric ids (promo codes like "SWSH123")
 * are left alone apart from uppercasing, since they carry no numeric
 * value to normalize.
 */
function canon(n: string): string {
	return /^\d+$/.test(n) ? String(Number(n)) : n.toUpperCase();
}

/** R2: number+total primary key, name tiebreaker; name-only fallback. */
export function matchScan(
	input: { reading: NumberReading | null; nameText: string | null },
	cards: CorpusCard[],
	sets: PokemonSet[],
): ScanCandidate[] {
	const { reading, nameText } = input;
	let pool: CorpusCard[];
	if (reading?.total != null) {
		// Secret rares print number > printedTotal but keep the printed
		// denominator, so match the denominator against printedTotal (fall back
		// to total for sets without one).
		const setIds = new Set(
			sets
				.filter((s) => (s.printedTotal ?? s.total) === reading.total)
				.map((s) => s.id),
		);
		const wanted = canon(reading.number);
		pool = cards.filter(
			(c) => setIds.has(c.setId) && canon(c.number) === wanted,
		);
	} else if (reading) {
		// Promo id: exact number match anywhere (case-insensitive).
		const wanted = canon(reading.number);
		pool = cards.filter((c) => canon(c.number) === wanted);
	} else if (nameText) {
		pool = cards; // name-only fallback
	} else {
		return [];
	}
	const scored = pool
		.map((c) => ({ cardId: c.id, score: nameScore(nameText, c.name) }))
		.sort((x, y) => y.score - x.score)
		.slice(0, 3);
	// Name-only fallback demands real similarity; keyed matches tolerate weak names.
	const floor = reading ? 0.15 : 0.55;
	return scored.filter((c) => c.score >= floor);
}
